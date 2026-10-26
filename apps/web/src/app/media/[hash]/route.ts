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
 * 自愈：目录未命中时从主站（settings.sync.baseUrl）按同路径补拉一次落盘（K-S2-5 协议：
 * 主站同路径约定 /media/<hash>.<ext>）；失败进入 10 分钟冷却，期间直接 404，不阻塞热路径。
 */
const ALLOWED = /^[a-f0-9]{8,64}$/i;
const EXT_CANDIDATES = ['jpg', 'png', 'webp', 'gif'];
const PULL_COOLDOWN_MS = 10 * 60 * 1000;
const pullFails = new Map<string, number>();

function syncConfig(): { sharedMediaDir?: string; baseUrl?: string } {
  try {
    const s = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json'), 'utf8'));
    return { sharedMediaDir: s?.sync?.sharedMediaDir, baseUrl: s?.sync?.baseUrl };
  } catch { return {}; }
}

function readFromDir(dir: string, hash: string): { file: string; buf: Buffer; type: string } | null {
  try {
    const candidates = fs.readdirSync(dir).filter(f => f.startsWith(hash + '.'));
    if (!candidates.length) return null;
    const file = path.join(dir, candidates[0]);
    // 防穿越(path.join 会把正斜杠归一成反斜杠,两侧都 resolve 后再比)
    if (path.dirname(path.resolve(file)) !== path.resolve(dir)) return null;
    const buf = fs.readFileSync(file);
    const ext = path.extname(candidates[0]).slice(1).toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return { file, buf, type };
  } catch {
    return null;
  }
}

/** 目录未命中 → 从主站同路径补拉落盘（多扩展名依次尝试；失败记冷却） */
async function pullFromMaster(hash: string, dir: string): Promise<{ buf: Buffer; type: string } | null> {
  const base = String(syncConfig().baseUrl || '').replace(/\/+$/, '');
  if (!base) return null;
  const failAt = pullFails.get(hash);
  if (failAt && Date.now() - failAt < PULL_COOLDOWN_MS) return null;

  for (const ext of EXT_CANDIDATES) {
    try {
      const res = await fetch(`${base}/media/${hash}.${ext}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) continue;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${hash}.${ext}`), buf);
      pullFails.delete(hash);
      return { buf, type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg' };
    } catch { /* 下一个扩展名 */ }
  }
  pullFails.set(hash, Date.now());
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash: raw } = await ctx.params;
  const hash = String(raw || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  if (!ALLOWED.test(hash)) return new NextResponse('Not found', { status: 404 });

  const dir = syncConfig().sharedMediaDir || path.resolve(process.cwd(), '..', '..', 'shared-media');
  let hit = readFromDir(dir, hash);
  if (!hit) {
    const pulled = await pullFromMaster(hash, dir);
    if (pulled) hit = { file: path.join(dir, hash), buf: pulled.buf, type: pulled.type };
  }
  if (!hit) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(hit.buf), {
    headers: { 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
