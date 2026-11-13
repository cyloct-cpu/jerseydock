/**
 * Meta Conversions API（CAPI）服务端事件模块
 * 对齐《JerseyDock COD 订单与 Meta Pixel / CAPI 需求、修改及测试验收文档》§5.5/§5.6：
 * - 队列：data/meta-capi-queue.jsonl（web/admin 两进程共用同一文件；入队按 eventId 去重，
 *   event_id 确定性生成 + Meta 侧 48h 去重兜底，保证同一业务事件最多计一次）
 * - 发送：flushCapiQueue() 由两端 worker 周期调用；失败指数退避（上限 6h），12 次后标 failed 供人工排查
 * - 日志：data/meta-capi.log（回传台账；绝不落 Access Token）
 * - 凭据：META_ACCESS_TOKEN / META_TEST_EVENT_CODE / META_API_VERSION 仅服务器端环境变量
 * - Pixel ID 读 data/admin/settings.json 的 metaPixel 节点（后台设置页可配；未启用则全链路静默）
 * - web/admin 两份同内容（独立构建，改一处需同步另一处）——与 db-store.ts 同约定
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DATA = path.resolve(process.cwd(), '..', '..', 'data');
const QUEUE_PATH = path.join(DATA, 'meta-capi-queue.jsonl');
const LOG_PATH = path.join(DATA, 'meta-capi.log');
const SETTINGS_PATH = path.join(DATA, 'admin', 'settings.json');

/** Pixel ID：后台设置页 metaPixel 节点（enabled 且非空才回传） */
function pixelId(): string {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const m = s?.metaPixel;
    return m?.enabled ? String(m.id || '').replace(/\D/g, '') : '';
  } catch { return ''; }
}

const apiVersion = (): string => String(process.env.META_API_VERSION || 'v21.0').replace(/^v/, '');
const accessToken = (): string => String(process.env.META_ACCESS_TOKEN || '');
const testEventCode = (): string => String(process.env.META_TEST_EVENT_CODE || '');

/** Meta 用户匹配字段：SHA-256(小写去首尾空格) */
export function sha256Normalized(v: string): string {
  return createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex');
}

export type CapiContents = { id: string; quantity: number; item_price?: number };

export type CapiEventInput = {
  /** 标准或自定义事件名：'Purchase' | 'CODOrderPlaced' … */
  eventName: string;
  /** 确定性唯一 ID（同业务事件重试/双端并发复用，Meta 去重键） */
  eventId: string;
  orderNo?: string;
  value?: number;
  currency?: string;
  numItems?: number;
  contents?: CapiContents[];
  /** 明文进、哈希出（SHA-256） */
  email?: string;
  phone?: string;
  clientIp?: string;
  clientUa?: string;
  /** _fbp/_fbc cookie 原文（链接浏览器与服务器事件，归因去重用） */
  fbp?: string;
  fbc?: string;
};

type QueueRow = {
  eventId: string;
  eventName: string;
  orderNo?: string;
  /** 完整的 Graph API data[0] 事件对象 */
  payload: Record<string, unknown>;
  state: 'pending' | 'sent' | 'failed';
  attempts: number;
  /** ms 时间戳；到期才发送 */
  nextAttemptAt: number;
  lastError?: string;
  sentAt?: string;
  enqueuedAt: string;
};

function readQueue(): QueueRow[] {
  try {
    return fs.readFileSync(QUEUE_PATH, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as QueueRow; } catch { return null; } })
      .filter((x): x is QueueRow => x !== null);
  } catch { return []; }
}

function writeQueue(rows: QueueRow[]): void {
  // 台账保留 30 天：更早的已发送行清理，pending/failed 永不清理
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const kept = rows.filter(r => r.state !== 'sent' || new Date(r.sentAt || r.enqueuedAt).getTime() > cutoff);
  const tmp = `${QUEUE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, kept.map(r => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
  fs.renameSync(tmp, QUEUE_PATH);
}

/** 回传日志（台账之外的过程记录；不落 Token） */
function appendLog(line: Record<string, unknown>): void {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n', 'utf8');
  } catch { /* 日志失败不影响主流程 */ }
}

/** 入队（幂等：同 eventId 已有 pending/sent 行则跳过；failed 行允许重新入队） */
export function enqueueCapiEvent(ev: CapiEventInput): boolean {
  if (!pixelId()) return false; // 像素未启用：全链路静默
  const rows = readQueue();
  if (rows.some(r => r.eventId === ev.eventId && r.state !== 'failed')) return false;
  const userData: Record<string, unknown> = {};
  if (ev.email) userData.em = [sha256Normalized(ev.email)];
  if (ev.phone) {
    const ph = String(ev.phone).replace(/[^\d]/g, '');
    if (ph) userData.ph = [sha256Normalized(ph)];
  }
  if (ev.fbp) userData.fbp = ev.fbp;
  if (ev.fbc) userData.fbc = ev.fbc;
  if (ev.clientIp) userData.client_ip_address = ev.clientIp;
  if (ev.clientUa) userData.client_user_agent = ev.clientUa;
  const custom: Record<string, unknown> = { content_type: 'product' };
  if (typeof ev.value === 'number' && Number.isFinite(ev.value)) custom.value = Math.round(ev.value * 100) / 100;
  if (ev.currency) custom.currency = ev.currency;
  if (ev.orderNo) custom.order_id = ev.orderNo;
  if (typeof ev.numItems === 'number' && ev.numItems > 0) custom.num_items = ev.numItems;
  if (ev.contents?.length) custom.contents = ev.contents;
  const payload: Record<string, unknown> = {
    event_name: ev.eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: ev.eventId,
    action_source: 'website',
    ...(Object.keys(userData).length ? { user_data: userData } : {}),
    custom_data: custom,
  };
  rows.push({
    eventId: ev.eventId,
    eventName: ev.eventName,
    orderNo: ev.orderNo,
    payload,
    state: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now(),
    enqueuedAt: new Date().toISOString(),
  });
  writeQueue(rows);
  appendLog({ action: 'enqueue', event: ev.eventName, eventId: ev.eventId, orderNo: ev.orderNo });
  return true;
}

async function sendOne(row: QueueRow, token: string, px: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v${apiVersion()}/${px}/events?access_token=${encodeURIComponent(token)}`;
  const body: Record<string, unknown> = { data: [row.payload] };
  const tec = testEventCode();
  if (tec) body.test_event_code = tec;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
    if (res.ok && Number(j.events_received) >= 1) {
      appendLog({ action: 'send', event: row.eventName, eventId: row.eventId, orderNo: row.orderNo, ok: true, http: res.status, received: j.events_received });
      return true;
    }
    const err = j.error?.message || `http ${res.status}`;
    appendLog({ action: 'send', event: row.eventName, eventId: row.eventId, orderNo: row.orderNo, ok: false, http: res.status, err: String(err).slice(0, 200) });
    row.lastError = String(err).slice(0, 300);
    return false;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    appendLog({ action: 'send', event: row.eventName, eventId: row.eventId, orderNo: row.orderNo, ok: false, err: err.slice(0, 200) });
    row.lastError = err.slice(0, 300);
    return false;
  }
}

/**
 * 周期发送：取到期 pending 行逐条 POST（量小逐条发，逐事件拿到准确回执）。
 * 成功标 sent；失败退避 2^n 分钟（上限 6h），累计 12 次标 failed（保留在队列文件供排查/重放）。
 * Token 未配置或像素未启用时整队挂起（不丢事件，配好凭据后自动续发）。
 */
export async function flushCapiQueue(limit = 10): Promise<{ sent: number; failed: number; pending: number }> {
  const token = accessToken();
  const px = pixelId();
  const rows = readQueue();
  if (!token || !px) return { sent: 0, failed: 0, pending: rows.filter(r => r.state === 'pending').length };
  const due = rows.filter(r => r.state === 'pending' && r.nextAttemptAt <= Date.now())
    .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt))
    .slice(0, limit);
  if (!due.length) return { sent: 0, failed: 0, pending: rows.filter(r => r.state === 'pending').length };
  let sent = 0;
  let failed = 0;
  for (const row of due) {
    if (await sendOne(row, token, px)) {
      row.state = 'sent';
      row.sentAt = new Date().toISOString();
      sent++;
    } else {
      row.attempts += 1;
      if (row.attempts >= 12) {
        row.state = 'failed';
        failed++;
        appendLog({ action: 'dead', event: row.eventName, eventId: row.eventId, orderNo: row.orderNo, attempts: row.attempts });
      } else {
        row.nextAttemptAt = Date.now() + Math.min(2 ** (row.attempts - 1) * 60_000, 6 * 3600_000);
      }
    }
  }
  writeQueue(rows);
  return { sent, failed, pending: rows.filter(r => r.state === 'pending').length };
}

declare global {
  // eslint-disable-next-line no-var
  var __kvCapiWorkerStarted: boolean | undefined;
}

/** CAPI 队列 flush worker（globalThis 锁防 dev 热重载重复起定时器） */
export function startCapiWorker(intervalMs = 60_000): void {
  if (globalThis.__kvCapiWorkerStarted) return;
  globalThis.__kvCapiWorkerStarted = true;
  const timer = setInterval(() => {
    flushCapiQueue()
      .then(r => { if (r.sent || r.failed) console.log(`[meta-capi] sent=${r.sent} failed=${r.failed} pending=${r.pending}`); })
      .catch(e => console.error('[meta-capi] flush error:', e instanceof Error ? e.message : e));
  }, intervalMs);
  timer.unref?.();
  console.log(`[meta-capi] worker started (flush every ${Math.round(intervalMs / 1000)}s)`);
}
