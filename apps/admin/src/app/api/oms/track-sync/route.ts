/**
 * POST /api/oms/track-sync — 手动触发一次 OMS 轨迹同步（worker 每 30 分钟自动跑，此为急查入口）
 */
import { NextRequest, NextResponse } from 'next/server';
import { syncOmsTracks, readOmsConfig } from '@/lib/oms';
import { can, verifySessionEdge, SESSION_COOKIE_NAME, readUserById } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  const user = session ? readUserById(session.sub) : null;
  if (!can(user, 'shipping.edit')) {
    return NextResponse.json({ ok: false, error: '无权操作（缺少权限：shipping.edit）' }, { status: 403 });
  }
  const cfg = readOmsConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ ok: false, error: '服务商代发未启用' }, { status: 400 });
  }
  const r = await syncOmsTracks();
  return NextResponse.json({ ok: true, synced: r.synced, changed: r.changed, reports: r.reports.slice(0, 10) });
}
