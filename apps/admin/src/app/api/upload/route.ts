import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionEdge } from '@/lib/session';
import { can, readUserById } from '@/lib/auth';
import { saveUploadFiles, UPLOAD_MAX_TOTAL, type UploadKind } from '@/lib/upload-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: UploadKind[] = ['hero', 'product', 'media', 'contact'];

/**
 * 统一上传入口：POST /api/upload?kind=hero|product|media|contact
 * - 会话鉴权 + 按类型校验权限（hero/contact → settings.edit，其余 → products.edit）
 * - 单文件 ≤ 5MB，单次请求 ≤ 12MB（路由处理器无 Server Action 的 1MB 限制）
 * - 保存后自动登记图库（data/admin/media.json）
 */
export async function POST(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') as UploadKind | null;
  if (!kind || !KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  }

  // 鉴权
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) return NextResponse.json({ ok: false, error: '登录已过期，请重新登录' }, { status: 401 });
  const user = readUserById(session.sub);
  if (!user) return NextResponse.json({ ok: false, error: '账号不存在' }, { status: 401 });

  const need = kind === 'hero' || kind === 'contact' ? 'settings.edit' : 'products.edit';
  if (!can(user, need)) {
    return NextResponse.json({ ok: false, error: '无权上传图片' }, { status: 403 });
  }

  // 请求体大小粗校验（精确大小由逐文件校验兜底）
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > UPLOAD_MAX_TOTAL) {
    return NextResponse.json({ ok: false, error: '上传内容超过 12MB' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: '请求格式错误' }, { status: 400 });
  }
  const files = [...form.getAll('files'), ...form.getAll('file')].filter(
    (f): f is File => typeof File !== 'undefined' && f instanceof File && f.size > 0,
  );
  if (!files.length) return NextResponse.json({ ok: false, error: '未选择文件' }, { status: 400 });

  const result = await saveUploadFiles(kind, files, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
