import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionEdge } from '@/lib/session';
import { listAllMediaItems, type MediaItem } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 图库列表：GET /api/media/list?q=&source=&page=&pageSize=
 * - q：名称 / URL 子串匹配（不分大小写）
 * - source：catalog=商品主图（外链）；local=本地上传；空=全部
 * - 返回 { ok, items, total, page, pageSize }；本地上传在前，商品主图在后
 * 图库总量约 3.7k+（含数据集主图），选择器 / 图库页一律走本接口分页拉取。
 */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) return NextResponse.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const source = sp.get('source') || '';
  const page = Math.max(1, Number(sp.get('page') || 1) || 1);
  const pageSize = Math.min(200, Math.max(12, Number(sp.get('pageSize') || 60) || 60));

  let items: MediaItem[] = listAllMediaItems();
  if (source === 'catalog') items = items.filter(m => m.source === 'catalog');
  else if (source === 'local') items = items.filter(m => m.source !== 'catalog');
  if (q) items = items.filter(m => m.name.toLowerCase().includes(q) || m.url.toLowerCase().includes(q));

  const total = items.length;
  const start = (page - 1) * pageSize;
  return NextResponse.json({ ok: true, items: items.slice(start, start + pageSize), total, page, pageSize });
}
