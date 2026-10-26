import { NextRequest, NextResponse } from 'next/server';
import { loadSyncSettings, pullCatalogSafe, SYNC_SOURCE } from '@/lib/catalog-sync';
import { dbGetSyncCursor } from '@/lib/db-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 同步拉取触发/状态（K-S2）
 * POST /api/sync/pull：手动触发一次拉取（Bearer settings.sync.token；定时器同权限）
 * GET  /api/sync/pull：查看开关与最近一次结果
 */
function auth(req: NextRequest): boolean {
  const cfg = loadSyncSettings();
  const header = req.headers.get('authorization') || '';
  return Boolean(cfg.token) && header === `Bearer ${cfg.token}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const cfg = loadSyncSettings();
  return NextResponse.json({ ok: true, enabled: cfg.enabled, baseUrl: cfg.baseUrl, cursor: dbGetSyncCursor(SYNC_SOURCE), lastResult: cfg.lastResult ?? null });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const r = await pullCatalogSafe();
  if ('error' in r) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...r });
}
