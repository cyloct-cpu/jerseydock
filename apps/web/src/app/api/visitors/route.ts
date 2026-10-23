import { NextRequest, NextResponse } from 'next/server';
import { touchVisitor, activeVisitors } from '@/lib/visitors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 查询活跃访客数（前台轮询用） */
export async function GET(req: NextRequest) {
  const w = Number(req.nextUrl.searchParams.get('window') || 5);
  const wm = Math.min(60, Math.max(1, Number.isFinite(w) ? w : 5));
  const { overall, byHandle } = activeVisitors(wm);
  return NextResponse.json(
    { overall, byHandle, window: wm },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

/** 前台心跳上报：每 60s 调一次，写入活跃访客表 */
export async function POST(req: NextRequest) {
  let body: { visitorId?: string; handle?: string; windowMinutes?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.visitorId) return NextResponse.json({ ok: true });
  const wm = Math.min(60, Math.max(1, Number(body.windowMinutes) || 5));
  touchVisitor(String(body.visitorId).slice(0, 40), String(body.handle || '').slice(0, 160), wm);
  return NextResponse.json({ ok: true });
}
