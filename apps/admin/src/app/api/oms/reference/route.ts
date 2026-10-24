/**
 * GET /api/oms/reference — 读取本地缓存的 OMS 渠道 / 仓库列表（设置页下拉数据源）
 * POST — 立即向 OMS 重新拉取并刷新缓存
 */
import { NextRequest, NextResponse } from 'next/server';
import { readRefCache, refreshOmsReferenceData, readOmsConfig } from '@/lib/oms';
import { can, verifySessionEdge, SESSION_COOKIE_NAME, readUserById } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function guard(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  const user = session ? readUserById(session.sub) : null;
  if (!can(user, 'settings.edit')) {
    return NextResponse.json({ ok: false, error: '无权操作（缺少权限：settings.edit）' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return NextResponse.json({
    ok: true,
    channels: readRefCache<{ service_id: number; service_code: string; service_name: string }>('channels'),
    warehouses: readRefCache<{ og_id: number; og_name: string }>('warehouses'),
  });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const cfg = readOmsConfig();
  if (!cfg.customerCode) {
    return NextResponse.json({ ok: false, error: '请先保存服务商账号（customer_code / customer_pwd）' }, { status: 400 });
  }
  const r = await refreshOmsReferenceData();
  return NextResponse.json({
    ok: !r.error,
    error: r.error,
    channels: r.methods.length,
    warehouses: r.warehouses.length,
  });
}
