import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 共享图库路由（K-S2-3）：/media/<hash>[.<ext>]
 * 两店共用内容寻址目录（文件名 = SHA-256），本店按需落盘；immutable 缓存（哈希内容不可变）。
 * 生产挂 /srv/media（settings.sync.sharedMediaDir）；开发默认 <repo>/shared-media/。
 * 安全：hash 白名单字符 + 只在目录内精确匹配文件，拒绝路径穿越。
 */
const ALLOWED = /^[a-f0-9]{8,64}$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash: raw } = await ctx.params;
  const hash = String(raw || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  if (!ALLOWED.test(hash)) return new NextResponse('Not found', { status: 404 });

  let dir = path.resolve(process.cwd(), '..', '..', 'shared-media');
  try {
    const s = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json'), 'utf8'));
    if (s?.sync?.sharedMediaDir) dir = String(s.sync.sharedMediaDir);
  } catch { /* 默认目录 */ }

  try {
    const candidates = fs.readdirSync(dir).filter(f => f.startsWith(hash + '.'));
    if (!candidates.length) return new NextResponse('Not found', { status: 404 });
    const file = path.join(dir, candidates[0]);
    // 防穿越(path.join 会把正斜杠归一成反斜杠,两侧都 resolve 后再比)
    if (path.dirname(path.resolve(file)) !== path.resolve(dir)) return new NextResponse('Not found', { status: 404 });
    const buf = fs.readFileSync(file);
    const ext = path.extname(candidates[0]).slice(1).toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
