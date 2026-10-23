/**
 * 实时在线访客（前台展示用）
 *
 * 与埋点分离：这里只关心「此刻有多少人在看」，写入 data/visitors.json
 * （小文件、按窗口清理），不污染 events.logl。
 *
 * 诚实说明：这是「最近 N 分钟内有活动的去重访客数」，不是 WebSocket
 * 意义上的在线。前台展示时会在真实数不足时用后台基准值补足，并由
 * 组件标注含演示数据，避免把补足值当成真实在线人数。
 */

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.cwd(), '..', '..', 'data', 'visitors.json');

type Entry = { id: string; handle: string; at: number };

type Store = { entries: Entry[] };

function read(): Store {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Store;
    return Array.isArray(j?.entries) ? j : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function write(s: Store): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s), 'utf8');
  } catch {}
}

/** 记录一次心跳（同一访客同一商品只保留最新时间） */
export function touchVisitor(visitorId: string, handle: string, windowMinutes: number): void {
  if (!visitorId) return;
  try {
    const store = read();
    const cutoff = Date.now() - windowMinutes * 60_000;
    const kept = store.entries.filter(e => e.at >= cutoff && e.id !== visitorId);
    kept.push({ id: visitorId, handle, at: Date.now() });
    write({ entries: kept });
  } catch {}
}

/**
 * 统计活跃访客数。
 * 返回 overall = 全站活跃人数；byHandle = 每个商品的活跃人数。
 */
export function activeVisitors(windowMinutes: number): { overall: number; byHandle: Record<string, number> } {
  try {
    const cutoff = Date.now() - windowMinutes * 60_000;
    const entries = read().entries.filter(e => e.at >= cutoff);
    const byHandle: Record<string, number> = {};
    for (const e of entries) {
      if (e.handle) byHandle[e.handle] = (byHandle[e.handle] || 0) + 1;
    }
    return { overall: entries.length, byHandle };
  } catch {
    return { overall: 0, byHandle: {} };
  }
}
