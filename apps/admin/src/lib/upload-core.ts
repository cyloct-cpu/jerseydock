/**
 * 上传核心逻辑（node 运行时，供 /api/upload 路由使用）
 * 走 API 路由而非 Server Action：Server Action 默认请求体上限 1MB，
 * >1MB 的图片必然上传失败；路由处理器无此限制，且更易于直接测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { registerMedia } from './media';
import { audit } from './auth';

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 单文件 5MB
export const UPLOAD_MAX_TOTAL = 12 * 1024 * 1024; // 单次请求 12MB
const IMG_EXTS = /\.(jpe?g|png|webp|avif)$/i;

export type UploadKind = 'hero' | 'product' | 'media' | 'contact';

export type UploadResult = { ok: boolean; url?: string; urls?: string[]; error?: string };

/** 文件名安全化：只保留字母数字 - _，限制长度 */
function safeBase(name: string): string {
  const base = path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'img').slice(0, 40);
}

/** 目标目录 + URL 前缀 + 单文件命名规则 */
function target(kind: UploadKind): { dir: string; prefix: string; single: boolean } {
  const webPublic = path.resolve(process.cwd(), '..', 'web', 'public');
  switch (kind) {
    case 'hero':
      return { dir: path.join(webPublic, 'assets', 'hero', 'uploads'), prefix: '/assets/hero/uploads', single: true };
    case 'contact':
      return { dir: path.join(webPublic, 'assets', 'contact'), prefix: '/assets/contact', single: true };
    case 'media':
      return { dir: path.join(webPublic, 'assets', 'media'), prefix: '/assets/media', single: false };
    case 'product':
    default:
      return { dir: path.join(webPublic, 'imports', `img_${Date.now().toString(36)}`), prefix: `/imports/img_${Date.now().toString(36)}`, single: false };
  }
}

/**
 * 保存上传文件并登记图库。逐张校验（格式 / 大小），部分失败时返回已成功 URL + 错误描述。
 */
export async function saveUploadFiles(kind: UploadKind, files: File[], adminId: string | null): Promise<UploadResult> {
  if (kind === 'hero' || kind === 'contact') {
    if (files.length > 1) return { ok: false, error: '该上传点只支持单张图片' };
  } else if (files.length > 20) {
    return { ok: false, error: '单次最多上传 20 张' };
  }

  const { dir, prefix } = target(kind);
  fs.mkdirSync(dir, { recursive: true });

  const urls: string[] = [];
  const registered: { url: string; name: string; size: number }[] = [];
  const errors: string[] = [];
  const ts = Date.now().toString(36);
  let n = 0;

  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!IMG_EXTS.test(ext)) { errors.push(`不支持的格式：${f.name}`); continue; }
    if (f.size > UPLOAD_MAX_BYTES) { errors.push(`超过 5MB：${f.name}`); continue; }
    if (f.size < 1024) { errors.push(`文件异常，可能已损坏：${f.name}`); continue; }
    n++;
    let name: string;
    if (kind === 'hero') name = `hero_${ts}${ext}`;
    else if (kind === 'contact') name = `support_qr_${ts}${ext}`;
    else if (kind === 'product') name = `${String(n).padStart(2, '0')}${ext}`;
    else name = `${ts}_${String(n).padStart(2, '0')}_${safeBase(f.name)}${ext}`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(await f.arrayBuffer()));
    const url = `${prefix}/${name}`;
    urls.push(url);
    registered.push({ url, name: f.name, size: f.size });
  }

  if (!urls.length) return { ok: false, error: errors.join('；') || '上传失败' };
  registerMedia(registered, kind === 'product' ? 'product' : kind);
  audit(adminId, `upload:${kind}`, `${urls.length} images`);
  return kind === 'hero' || kind === 'contact'
    ? { ok: true, url: urls[0], error: errors.length ? errors.join('；') : undefined }
    : { ok: true, urls, error: errors.length ? errors.join('；') : undefined };
}
