import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SESSION_COOKIE_NAME, verifySessionEdge } from '@/lib/session';
import { can, readUserById, audit } from '@/lib/auth';
import { mediaUrlInUse, mediaUrlToFile, removeMedia } from '@/lib/media';
import fs from 'node:fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 图库删除：POST /api/media/delete  body: { url }
 * - 被商品或店铺设置引用的图片拒绝删除
 * - 删除物理文件 + 图库索引
 */
export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) return NextResponse.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 });
  const user = readUserById(session.sub);
  if (!user) return NextResponse.json({ ok: false, error: '账号不存在' }, { status: 401 });
  if (!can(user, 'products.edit')) {
    return NextResponse.json({ ok: false, error: '无权删除图片' }, { status: 403 });
  }

  let url = '';
  try {
    const body = await req.json();
    url = String(body?.url || '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  }
  if (!url.startsWith('/')) return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });

  const usedBy = mediaUrlInUse(url);
  if (usedBy) {
    return NextResponse.json({ ok: false, error: `该图片正在被${usedBy}使用，请先在对应位置移除引用` }, { status: 409 });
  }

  const file = mediaUrlToFile(url);
  if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
  removeMedia(url);
  audit(user.id, 'media:delete', url);
  revalidatePath('/media');
  return NextResponse.json({ ok: true });
}
