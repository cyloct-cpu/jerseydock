/**
 * GET /api/oms/label/[orderNo] — 输出本地留存的面单 PDF（面单 URL 服务商只保留 20 天，发货时已下载到 data/labels/）
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { LABELS_DIR } from '@/lib/oms';
import { can, verifySessionEdge, SESSION_COOKIE_NAME, readUserById } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  const user = session ? readUserById(session.sub) : null;
  if (!can(user, 'shipping.view')) {
    return NextResponse.json({ ok: false, error: '无权查看' }, { status: 403 });
  }
  const { orderNo } = await params;
  const safe = String(orderNo).replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  const p = path.join(LABELS_DIR, `${safe}.pdf`);
  if (!fs.existsSync(p)) {
    return NextResponse.json({ ok: false, error: '面单不存在（可能推送失败或尚未下载，可重试推送）' }, { status: 404 });
  }
  const buf = fs.readFileSync(p);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safe}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
