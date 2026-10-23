import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readStatus, runReindex } from '@/lib/image-index-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_FILE = path.resolve(process.cwd(), '..', '..', 'data', 'search', 'reindex-token.txt');

/** 门禁令牌：优先环境变量 REINDEX_TOKEN；否则用本地令牌文件（首次自动生成） */
function getToken(): string {
  if (process.env.REINDEX_TOKEN) return process.env.REINDEX_TOKEN;
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    const token = crypto.randomBytes(24).toString('hex');
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
    return token;
  }
}

function authorized(req: NextRequest): boolean {
  const header = req.headers.get('x-reindex-token') || '';
  const expected = getToken();
  return header.length > 0 && header.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * 以图搜款 · 索引构建
 * POST /api/search/reindex  { mode: 'full' | 'incremental' }
 *   - 长任务：立即返回，后台执行；进度查 GET
 * GET  /api/search/reindex   → 当前进度
 * 鉴权：Header x-reindex-token（值见 data/search/reindex-token.txt 或 env REINDEX_TOKEN）
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const cur = readStatus();
  // 僵尸任务判定：标记运行中但超过 30 分钟无完成（服务被 kill 会留下该状态），允许重新开始
  const stale = cur.running && cur.startedAt && Date.now() - Date.parse(cur.startedAt) > 30 * 60 * 1000;
  if (cur.running && !stale) {
    return NextResponse.json({ ok: false, error: '已有构建任务在进行中', status: cur }, { status: 409 });
  }
  let mode: 'full' | 'incremental' = 'full';
  try {
    const body = await req.json();
    if (body?.mode === 'incremental') mode = 'incremental';
  } catch { /* 默认 full */ }

  // 后台执行，不阻塞响应（不 await）
  void runReindex(mode);
  return NextResponse.json({ ok: true, mode, message: '索引构建已开始，通过 GET 查看进度' });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: readStatus() });
}
