/**
 * GET /api/fx
 * 服务端汇率（免费源轮换 + 1 小时内存缓存），客户端统一从这里取，
 * 避免浏览器直连第三方 API 的 CORS/限流问题。
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { fetchRates } from '@kitvault/shared';

export const dynamic = 'force-dynamic';

let cached: { at: number; data: Awaited<ReturnType<typeof fetchRates>> } | null = null;
const TTL = 24 * 60 * 60 * 1000; // 24 小时（每天拉取一次）
const LAST_FILE = path.resolve(process.cwd(), '..', '..', 'data', 'fx-last.json');

/** 上次成功拉取的汇率落盘（服务重启 / 全源失败时兜底） */
function readLast(): { at: string; rates: Record<string, number>; source: string } | null {
  try { return JSON.parse(fs.readFileSync(LAST_FILE, 'utf8')); } catch { return null; }
}

function writeLast(data: { rates: Record<string, number>; source: string }): void {
  try {
    fs.mkdirSync(path.dirname(LAST_FILE), { recursive: true });
    fs.writeFileSync(LAST_FILE, JSON.stringify({ at: new Date().toISOString(), ...data }));
  } catch { /* 忽略写盘失败 */ }
}

export async function GET() {
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
  }
  const data = await fetchRates();
  if (data.source !== 'fallback') {
    // 拉取成功：缓存 + 落盘
    cached = { at: Date.now(), data };
    writeLast(data);
    return NextResponse.json({ ...data, cached: false });
  }
  // 全源失败：用上次成功值（可能为昨天或更早），再不行用内置兜底
  const last = readLast();
  if (last) {
    cached = { at: Date.now(), data: { rates: last.rates, source: 'last-known' } };
    return NextResponse.json({ ...cached.data, cached: true, stale: true });
  }
  return NextResponse.json({ ...data, cached: false });
}
