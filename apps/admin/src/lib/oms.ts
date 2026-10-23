/**
 * OMS 对接核心（admin 服务端）：
 *  - 配置读取（data/admin/settings.json → oms 键，env 可兜底）
 *  - 推送队列消费（data/oms/push-queue.jsonl → CreateLogisticsOrder → 单号/面单回写订单）
 *  - 轨迹轮询（GetOrderTrack 批量 → shipment.events / fulfillmentStatus / COD 签收事件）
 *  - 面单下载（面单 URL 仅保留 20 天，必须落盘 data/labels/）
 *  - 进程内 worker（instrumentation 启动：每分钟消费队列，每 30 分钟拉轨迹）
 * 本文件不 import next/headers 等服务端 API，保证可被 instrumentation 安全加载。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_OMS_CONFIG,
  normalizeOmsConfig,
  omsCreateDirectOrder,
  omsGetOrderTrack,
  omsGetTrackingNumber,
  omsGetShippingMethods,
  omsGetWarehouses,
  omsTrackToFulfillment,
  buildDirectOrderPayload,
  type OmsConfig,
  type OmsShippingMethod,
  type OmsWarehouse,
  type OmsTrackItem,
  type OrderLike,
} from '@kitvault/shared';

const DATA = path.resolve(process.cwd(), '..', '..', 'data');
const SETTINGS_PATH = path.join(DATA, 'admin', 'settings.json');
export const OMS_QUEUE = path.join(DATA, 'oms', 'push-queue.jsonl');
export const LABELS_DIR = path.join(DATA, 'labels');
const OMS_DIR = path.join(DATA, 'oms');

export type QueueRow = {
  orderNo: string;
  enqueuedAt: string;
  attempts: number;
  state: 'pending' | 'done' | 'failed';
  lastError?: string;
};

export type OmsOrderInfo = {
  orderType: 'direct' | 'wms' | 'return';
  orderId?: number;
  orderNumber?: string;
  trackingNumber?: string;
  serviceCode: string;
  ogId: number;
  pushedAt?: string;
  labelPath?: string;
  pushError?: string;
  awaitingNumber?: boolean;
  codEventAdded?: boolean;
  lastTrackStatus?: string;
  lastTrackAt?: string;
  trackSyncedAt?: string;
};

export type AnyOrder = Record<string, any> & OrderLike & { oms?: OmsOrderInfo; codConfirmedAt?: string; deliveredAt?: string; shippedAt?: string; fulfillmentStatus?: string; shipment?: { carrier: string; trackingNo: string; status?: string; events?: { time: string; location?: string; description: string }[] } };

/* ---------------- 配置 ---------------- */

export function readOmsConfig(): OmsConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))?.oms;
  } catch {
    raw = undefined;
  }
  const cfg = normalizeOmsConfig(raw);
  // env 兜底（后台未配置时可用环境变量先行）
  if (!cfg.customerCode && process.env.OMS_CUSTOMER_CODE) cfg.customerCode = process.env.OMS_CUSTOMER_CODE;
  if (!cfg.customerPwd && process.env.OMS_CUSTOMER_PWD) cfg.customerPwd = process.env.OMS_CUSTOMER_PWD;
  if (process.env.OMS_BASE_URL) cfg.baseUrl = process.env.OMS_BASE_URL;
  return cfg;
}

/* ---------------- 队列 ---------------- */

export function readQueue(): QueueRow[] {
  try {
    return fs.readFileSync(OMS_QUEUE, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as QueueRow; } catch { return null; } })
      .filter((x): x is QueueRow => x !== null);
  } catch {
    return [];
  }
}

export function writeQueue(rows: QueueRow[]): void {
  fs.mkdirSync(path.dirname(OMS_QUEUE), { recursive: true });
  fs.writeFileSync(OMS_QUEUE, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

/** 入队（幂等：pending 已存在跳过；done/failed 重新打开）。返回是否新入队 */
export function enqueueOmsPush(orderNo: string): boolean {
  const rows = readQueue();
  const ex = rows.find(r => r.orderNo.toUpperCase() === orderNo.toUpperCase());
  if (ex && ex.state === 'pending') return false;
  if (ex) {
    ex.state = 'pending';
    ex.attempts = 0;
    ex.lastError = undefined;
  } else {
    rows.push({ orderNo, enqueuedAt: new Date().toISOString(), attempts: 0, state: 'pending' });
  }
  writeQueue(rows);
  return true;
}

/* ---------------- 订单读写 ---------------- */

function readOrders(): AnyOrder[] {
  try {
    return fs.readFileSync(path.join(DATA, 'orders.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as AnyOrder; } catch { return null; } })
      .filter((x): x is AnyOrder => x !== null);
  } catch {
    return [];
  }
}

function writeOrders(orders: AnyOrder[]): void {
  fs.writeFileSync(path.join(DATA, 'orders.jsonl'), orders.map(o => JSON.stringify(o)).join('\n') + (orders.length ? '\n' : ''), 'utf8');
}

/* ---------------- 面单下载 ---------------- */

export function labelPathFor(orderNo: string): string {
  return path.join(LABELS_DIR, `${orderNo}.pdf`);
}

export async function downloadLabel(orderNo: string, url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return undefined;
    fs.mkdirSync(LABELS_DIR, { recursive: true });
    const p = labelPathFor(orderNo);
    fs.writeFileSync(p, buf);
    return p;
  } catch {
    return undefined;
  }
}

/* ---------------- 推送队列消费 ---------------- */

export type PushReport = { orderNo: string; ok: boolean; trackingNumber?: string; error?: string };

const MAX_ATTEMPTS = 5;

/** 消费推送队列（worker 每分钟调用；dispatch 路由/重试按钮也会主动调一次） */
export async function processPushQueue(): Promise<{ pushed: number; failed: number; awaiting: number; reports: PushReport[] }> {
  const cfg = readOmsConfig();
  const reports: PushReport[] = [];
  if (!cfg.enabled || !cfg.customerCode) return { pushed: 0, failed: 0, awaiting: 0, reports };

  const queue = readQueue();
  const pending = queue.filter(r => r.state === 'pending');
  if (!pending.length) return { pushed: 0, failed: 0, awaiting: 0, reports };

  const orders = readOrders();
  let dirtyQueue = false;
  let dirtyOrders = false;
  let pushed = 0, failed = 0, awaiting = 0;

  for (const row of pending) {
    const o = orders.find(x => String(x.orderNo).toUpperCase() === row.orderNo.toUpperCase());
    if (!o) {
      row.state = 'failed';
      row.lastError = '订单不存在（可能已被删除）';
      dirtyQueue = true;
      failed++;
      reports.push({ orderNo: row.orderNo, ok: false, error: row.lastError });
      continue;
    }
    o.oms = o.oms || { orderType: 'direct', serviceCode: cfg.defaultServiceCode, ogId: cfg.defaultOgId };

    // 已有单号（可能之前推成功过）→ 直接完成
    if (o.oms.trackingNumber) {
      row.state = 'done';
      dirtyQueue = true;
      pushed++;
      continue;
    }

    // 异步取号补拉：label_status=-1 时等待服务商出号，用 GetTrackingNumber 补拉
    if (o.oms.awaitingNumber) {
      try {
        const r = await omsGetTrackingNumber(cfg, o.orderNo);
        const d = (r.data ?? {}) as Record<string, unknown>;
        const tn = String(d.tracking_number ?? '');
        if (r.code === 1 && tn) {
          applyTracking(o, cfg, tn, String(d.label ?? ''), String(d.order_number ?? ''), Number(d.og_id ?? cfg.defaultOgId) || cfg.defaultOgId);
          o.oms.awaitingNumber = false;
          row.state = 'done';
          dirtyQueue = true;
          dirtyOrders = true;
          pushed++;
          reports.push({ orderNo: o.orderNo, ok: true, trackingNumber: tn });
        } else {
          row.attempts += 1;
          if (row.attempts >= 30) {
            row.state = 'failed';
            row.lastError = '异步取号超时（30 分钟未出号），请到服务商后台确认';
            o.oms.pushError = row.lastError;
            dirtyQueue = true;
            dirtyOrders = true;
            failed++;
          } else {
            awaiting++;
          }
        }
      } catch (e) {
        row.attempts += 1;
        row.lastError = e instanceof Error ? e.message : String(e);
        if (row.attempts >= 30) { row.state = 'failed'; o.oms.pushError = row.lastError; dirtyQueue = true; failed++; }
        else awaiting++;
      }
      continue;
    }

    // 常规推送
    try {
      const payload = buildDirectOrderPayload(o, cfg, { serviceCode: o.oms.serviceCode || undefined, ogId: o.oms.ogId || undefined });
      const r = await omsCreateDirectOrder(cfg, payload);
      if (r.code === 1 || r.code === 2) {
        const d = r.data ?? {};
        const tn = String(d.tracking_number ?? '');
        const labelStatus = String(d.label_status ?? '');
        if (tn) {
          const labelUrl = String(d.label ?? '');
          applyTracking(o, cfg, tn, labelUrl, String(d.order_number ?? ''), Number(d.og_id ?? '') ? Number(d.og_id) : (o.oms.ogId || cfg.defaultOgId));
          if (labelUrl) {
            const p = await downloadLabel(o.orderNo, labelUrl);
            if (p) o.oms.labelPath = p;
          }
          o.oms.pushError = undefined;
          row.state = 'done';
          dirtyQueue = true;
          dirtyOrders = true;
          pushed++;
          reports.push({ orderNo: o.orderNo, ok: true, trackingNumber: tn });
        } else if (labelStatus === '-1' || r.code === 2) {
          // 异步取号：先记下已预报状态，下个周期补拉
          o.oms.awaitingNumber = true;
          o.oms.pushedAt = o.oms.pushedAt || new Date().toISOString();
          o.oms.pushError = undefined;
          dirtyOrders = true;
          awaiting++;
        } else {
          throw new Error('OMS 未返回跟踪单号');
        }
      } else {
        throw new Error(r.msg || 'OMS 拒绝（Code 0）');
      }
    } catch (e) {
      row.attempts += 1;
      row.lastError = e instanceof Error ? e.message : String(e);
      o.oms.pushError = row.lastError;
      o.oms.awaitingNumber = false;
      dirtyOrders = true;
      if (row.attempts >= MAX_ATTEMPTS) {
        row.state = 'failed';
        dirtyQueue = true;
        failed++;
      }
      reports.push({ orderNo: o.orderNo, ok: false, error: row.lastError });
    }
  }

  if (dirtyQueue) writeQueue(queue);
  if (dirtyOrders) writeOrders(orders);
  return { pushed, failed, awaiting, reports };
}

/** 推送成功后回写订单（单号/渠道/履约状态，等价于一次 shipOrder） */
function applyTracking(o: AnyOrder, cfg: OmsConfig, trackingNumber: string, labelUrl: string, orderNumber: string, ogId: number): void {
  o.oms = o.oms || { orderType: 'direct', serviceCode: cfg.defaultServiceCode, ogId };
  o.oms.trackingNumber = trackingNumber;
  if (orderNumber) o.oms.orderNumber = orderNumber;
  if (ogId) o.oms.ogId = ogId;
  o.oms.pushedAt = o.oms.pushedAt || new Date().toISOString();
  const events = Array.isArray(o.shipment?.events) ? o.shipment.events : [];
  o.shipment = {
    carrier: o.oms.serviceCode || cfg.defaultServiceCode,
    trackingNo: trackingNumber,
    status: 'in_transit',
    events: [...events, { time: new Date().toISOString(), location: 'OMS', description: 'Order submitted to fulfillment provider, tracking number assigned' }],
  };
  o.fulfillmentStatus = 'shipped';
  o.shippedAt = o.shippedAt || new Date().toISOString();
  o.updatedAt = new Date().toISOString();
}

/* ---------------- 轨迹同步 ---------------- */

export type TrackSyncReport = { orderNo: string; status?: string; changed?: boolean };

/** 批量拉取所有 OMS 订单的轨迹（worker 每 30 分钟；track-sync 路由手动触发） */
export async function syncOmsTracks(): Promise<{ synced: number; changed: number; reports: TrackSyncReport[] }> {
  const cfg = readOmsConfig();
  if (!cfg.enabled || !cfg.customerCode) return { synced: 0, changed: 0, reports: [] };

  const orders = readOrders().filter(o => o.oms?.trackingNumber);
  if (!orders.length) return { synced: 0, changed: 0, reports: [] };

  const byRef = new Map<string, AnyOrder>();
  for (const o of orders) byRef.set(String(o.orderNo).toUpperCase(), o);

  const reports: TrackSyncReport[] = [];
  let changed = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < orders.length; i += 100) {
    const batch = orders.slice(i, i + 100);
    let items: OmsTrackItem[] = [];
    try {
      const r = await omsGetOrderTrack(cfg, batch.map(o => String(o.orderNo)));
      items = Array.isArray(r.data) ? r.data : [];
    } catch (e) {
      reports.push({ orderNo: `(batch ${i / 100 + 1})`, status: e instanceof Error ? e.message : 'track fetch failed' });
      continue;
    }

    let dirty = false;
    for (const it of items) {
      const key = String(it.no ?? '').toUpperCase();
      const o = byRef.get(key);
      if (!o) continue;
      const zh = String(it.newTrack ?? '').trim();
      const events = Array.isArray(o.shipment?.events) ? [...o.shipment.events] : [];
      const before = o.fulfillmentStatus;

      // 事件合并（英文入库，前台按语言机翻；按 time+description 去重）
      for (const ev of it.events ?? []) {
        const time = String(ev.time ?? '').trim();
        const desc = String(ev.en_content ?? ev.content ?? '').trim();
        if (!time || !desc) continue;
        if (events.some(x => x.time === time && x.description === desc)) continue;
        const iso = /^\d{4}-\d{2}-\d{2}T/.test(time) ? time : new Date(time.replace(' ', 'T') + 'Z').toISOString();
        events.push({ time: iso, location: String(ev.location ?? ''), description: desc });
      }
      events.sort((a, b) => (a.time < b.time ? -1 : 1));

      o.oms = o.oms || { orderType: 'direct', serviceCode: cfg.defaultServiceCode, ogId: cfg.defaultOgId };
      if (zh) {
        o.oms.lastTrackStatus = zh;
        o.oms.lastTrackAt = String(it.newTrackDate ?? now);
      }
      o.oms.trackSyncedAt = now;

      // 履约状态只升级：delivered 粘滞；exception 覆盖在途；在途覆盖已发货
      const mapped = omsTrackToFulfillment(zh);
      const cur = (o.fulfillmentStatus as string) || 'unfulfilled';
      const rank: Record<string, number> = { unfulfilled: 0, packing: 1, shipped: 2, in_transit: 3, delivered: 5, exception: 4 };
      if (mapped === 'delivered') {
        o.fulfillmentStatus = 'delivered';
        o.deliveredAt = o.deliveredAt || String(it.newTrackDate ?? now);
        // COD：签收时追加合成事件（一次），提示代收款待回款
        const isCod = o.paymentMethod === 'cod' || o.paymentStatus === 'cod';
        if (isCod && !o.oms.codEventAdded) {
          o.oms.codEventAdded = true;
          events.push({
            time: o.deliveredAt,
            location: '',
            description: `Package delivered · COD amount $${Number(o.totalUsd).toFixed(2)} to be collected via carrier`,
          });
        }
      } else if (mapped === 'exception' && cur !== 'delivered') {
        o.fulfillmentStatus = 'exception';
      } else if ((mapped === 'in_transit' || mapped === 'shipped') && (cur === 'shipped' || cur === 'unfulfilled' || cur === 'packing')) {
        o.fulfillmentStatus = 'in_transit';
      }
      o.shipment = { ...(o.shipment || { carrier: '', trackingNo: o.oms.trackingNumber! }), status: o.fulfillmentStatus === 'delivered' ? 'delivered' : o.fulfillmentStatus === 'exception' ? 'exception' : 'in_transit', events };
      o.updatedAt = now;
      if (before !== o.fulfillmentStatus) changed++;
      dirty = true;
      reports.push({ orderNo: o.orderNo, status: zh, changed: before !== o.fulfillmentStatus });
    }
    if (dirty) writeOrders(orders);
  }

  return { synced: orders.length, changed, reports: reports.slice(0, 50) };
}

/* ---------------- 渠道 / 仓库缓存（settings 页下拉 + 渠道核对用） ---------------- */

type RefCache<T> = { fetchedAt: string; items: T[] };

function refCachePath(name: string): string {
  return path.join(OMS_DIR, `cache-${name}.json`);
}

export function readRefCache<T>(name: string): RefCache<T> | null {
  try {
    return JSON.parse(fs.readFileSync(refCachePath(name), 'utf8')) as RefCache<T>;
  } catch {
    return null;
  }
}

export async function refreshOmsReferenceData(): Promise<{ methods: OmsShippingMethod[]; warehouses: OmsWarehouse[]; error?: string }> {
  const cfg = readOmsConfig();
  const out: { methods: OmsShippingMethod[]; warehouses: OmsWarehouse[]; error?: string } = { methods: [], warehouses: [] };
  try {
    const r = await omsGetShippingMethods(cfg);
    if (r.code === 1 && Array.isArray(r.data)) {
      out.methods = r.data;
      fs.mkdirSync(OMS_DIR, { recursive: true });
      fs.writeFileSync(refCachePath('channels'), JSON.stringify({ fetchedAt: new Date().toISOString(), items: r.data }, null, 1), 'utf8');
    } else out.error = r.msg;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  try {
    const r = await omsGetWarehouses(cfg);
    if (r.code === 1 && Array.isArray(r.data)) {
      out.warehouses = r.data;
      fs.writeFileSync(refCachePath('warehouses'), JSON.stringify({ fetchedAt: new Date().toISOString(), items: r.data }, null, 1), 'utf8');
    }
  } catch { /* 渠道成功仓库失败时保留已有错误信息 */ }
  return out;
}

/* ---------------- 进程内 worker ---------------- */

declare global {
  // eslint-disable-next-line no-var
  var __kvOmsWorkerStarted: boolean | undefined;
}

export function ensureOmsWorker(): void {
  if (globalThis.__kvOmsWorkerStarted) return;
  globalThis.__kvOmsWorkerStarted = true;
  const cfg = readOmsConfig();
  if (!cfg.enabled) {
    console.log('[oms-worker] OMS 未启用，worker 空转（后台设置开启后自动生效）');
  }
  // 推送队列：每分钟
  setInterval(() => {
    processPushQueue().then(r => {
      if (r.pushed || r.failed) console.log(`[oms-worker] push pushed=${r.pushed} failed=${r.failed} awaiting=${r.awaiting}`);
    }).catch(e => console.error('[oms-worker] push cycle error:', e instanceof Error ? e.message : e));
  }, 60 * 1000).unref?.();
  // 轨迹同步：每 30 分钟
  setInterval(() => {
    syncOmsTracks().then(r => {
      if (r.synced) console.log(`[oms-worker] track synced=${r.synced} changed=${r.changed}`);
    }).catch(e => console.error('[oms-worker] track cycle error:', e instanceof Error ? e.message : e));
  }, 30 * 60 * 1000).unref?.();
  console.log('[oms-worker] started (push every 60s, track every 30min)');
}
