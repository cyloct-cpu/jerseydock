/**
 * POST /api/oms/dispatch — 手动推送/重试指定订单到 OMS
 * 入参 { orderNos: string[] }；入队后立即消费一次队列，返回逐单结果。
 */
import { NextRequest, NextResponse } from 'next/server';
import { enqueueOmsPush, processPushQueue, readOmsConfig } from '@/lib/oms';
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
    return NextResponse.json({ ok: false, error: 'OMS 未启用：请先到 设置 → OMS 代发 完成绑定并开启' }, { status: 400 });
  }

  let orderNos: string[] = [];
  try {
    const body = await req.json();
    orderNos = Array.isArray(body?.orderNos) ? body.orderNos.map(String).filter(Boolean).slice(0, 100) : [];
  } catch { /* ignore */ }
  if (!orderNos.length) return NextResponse.json({ ok: false, error: '缺少 orderNos' }, { status: 400 });

  for (const no of orderNos) enqueueOmsPush(no);
  const r = await processPushQueue();
  return NextResponse.json({
    ok: true,
    pushed: r.pushed,
    failed: r.failed,
    awaiting: r.awaiting,
    reports: r.reports.filter(x => orderNos.includes(x.orderNo)),
  });
}
