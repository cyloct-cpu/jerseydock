import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * 运行时媒体文件服务（/imports/*）。
 *
 * 背景：`next start` 生产服务器在启动时快照 public/ 目录，之后通过后台上传的
 * 新文件不会被静态处理器识别（404），必须重启才可见。此路由按请求实时读盘，
 * 为 public 快照之外的文件兜底 —— 上传后立即生效，无需重启。
 *
 * 挂载点为 /assets/[...path]，顶层段 "assets" 由路由路径消费，
 * 因此实际磁盘位置为 public/assets/<...path>。
 */

// 共享存储：上传文件统一写入 web 的 public，admin 也从那里读
const STORAGE_CANDIDATES = [
  path.resolve(process.cwd(), '..', 'web', 'public'),
  path.resolve(process.cwd(), 'public'),
];
const STORAGE = STORAGE_CANDIDATES.find((d) => fs.existsSync(d)) ?? STORAGE_CANDIDATES[0];
const BASE = path.join(STORAGE, 'imports');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segs } = await params;
  if (
    !segs?.length ||
    segs.some((s) => !s || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))
  ) {
    return new NextResponse('Not found', { status: 404 });
  }
  const file = path.join(BASE, ...segs);
  if (!file.startsWith(BASE + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return new NextResponse('Unsupported media type', { status: 415 });
  const buf = await fs.promises.readFile(file);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
