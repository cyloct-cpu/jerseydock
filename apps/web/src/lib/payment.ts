/**
 * 支付（前台侧）
 * - loadPaymentSettings：读取后台支付配置（data/admin/settings.json → payment）
 * - getPaymentProvider：解析当前通道（密钥缺失自动回退占位）
 * - markOrderPaid：Webhook / 回跳落地页把订单标记为已付款（orders.jsonl）
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PAYMENT_SETTINGS,
  normalizePayment,
  resolvePaymentProvider,
  type PaymentProvider,
  type PaymentSettings,
} from '@kitvault/shared';

const SETTINGS_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json');
const ORDERS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'orders.jsonl');

export function loadPaymentSettings(): PaymentSettings {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return normalizePayment(s?.payment ?? DEFAULT_PAYMENT_SETTINGS);
  } catch {
    return DEFAULT_PAYMENT_SETTINGS;
  }
}

export function getPaymentProvider(): PaymentProvider {
  return resolvePaymentProvider(loadPaymentSettings());
}

export type OrderRow = {
  orderNo: string;
  email: string;
  totalUsd: number;
  paymentMethod: string;
  paymentStatus: string;
  [k: string]: unknown;
};

/** 读取全部订单（JSON Lines，与后台共用） */
export function readOrders(): OrderRow[] {
  try {
    return fs
      .readFileSync(ORDERS_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l) as OrderRow; } catch { return null; } })
      .filter((x): x is OrderRow => x !== null);
  } catch {
    return [];
  }
}

/**
 * 标记订单已付款（幂等：已 paid 的订单不重复写）。
 * 返回是否发生了状态变更。
 */
export function markOrderPaid(orderNo: string, reference?: string): boolean {
  const orders = readOrders();
  const o = orders.find(x => String(x.orderNo).toUpperCase() === orderNo.toUpperCase());
  if (!o || o.paymentStatus === 'paid') return false;
  o.paymentStatus = 'paid';
  o.paidAt = new Date().toISOString();
  if (reference) o.paymentReference = reference;
  fs.mkdirSync(path.dirname(ORDERS_LOG), { recursive: true });
  fs.writeFileSync(ORDERS_LOG, orders.map(x => JSON.stringify(x)).join('\n') + (orders.length ? '\n' : ''), 'utf8');
  // 先付款后发货：付款确认即入 OMS 推送队列（后台 worker 消费；未启用 OMS 时 worker 不会消费，无副作用）
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { enqueueOmsPush } = require('./oms-queue') as typeof import('./oms-queue');
    enqueueOmsPush(orderNo);
  } catch { /* 入队失败不阻塞支付回调，后台可手动推送 */ }
  return true;
}
