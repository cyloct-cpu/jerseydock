/**
 * OMS 推送队列（前台侧写入，后台 worker 消费）
 * 文件：data/oms/push-queue.jsonl，每行 { orderNo, enqueuedAt, attempts, state, lastError? }
 * state: pending=待推送 | done=已推送成功 | failed=重试超限失败
 * 前台只入队不直调 OMS：支付回调要快，且 OMS 调用统一收敛在后台（代理/超时/账密都在那边）。
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(process.cwd(), '..', '..', 'data');
export const OMS_QUEUE = path.join(DATA, 'oms', 'push-queue.jsonl');

export type QueueRow = {
  orderNo: string;
  enqueuedAt: string;
  attempts: number;
  state: 'pending' | 'done' | 'failed';
  lastError?: string;
};

export function readOmsQueue(): QueueRow[] {
  try {
    return fs.readFileSync(OMS_QUEUE, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as QueueRow; } catch { return null; } })
      .filter((x): x is QueueRow => x !== null);
  } catch {
    return [];
  }
}

export function writeOmsQueue(rows: QueueRow[]): void {
  fs.mkdirSync(path.dirname(OMS_QUEUE), { recursive: true });
  fs.writeFileSync(OMS_QUEUE, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

/** 入队（幂等：同单已有 pending 条目则跳过；done/failed 的单重新打开为 pending） */
export function enqueueOmsPush(orderNo: string): boolean {
  const rows = readOmsQueue();
  const existing = rows.find(r => r.orderNo.toUpperCase() === orderNo.toUpperCase());
  if (existing && existing.state === 'pending') return false;
  if (existing) {
    existing.state = 'pending';
    existing.attempts = 0;
    existing.lastError = undefined;
  } else {
    rows.push({ orderNo, enqueuedAt: new Date().toISOString(), attempts: 0, state: 'pending' });
  }
  writeOmsQueue(rows);
  return true;
}
