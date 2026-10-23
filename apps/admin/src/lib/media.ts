/**
 * 图库（媒体库）数据层
 * - 索引：data/admin/media.json（url 唯一，新的在前）
 * - 所有后台本地上传（商品图 / Hero 轮播 / 客服二维码 / 图库页）经 registerMedia 自动登记
 * - syncMedia：扫描 web/public 下已知上传目录，兜底登记遗漏文件、清理已失效条目
 * - 商品数据集主图（外链）不落盘，listMediaItems 时实时合成 catalog 条目，编辑商品可直接选取
 * - 删除保护：被商品或店铺设置引用的图片不允许物理删除（外链条目无文件，仅可复制链接）
 */
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCTS } from '@kitvault/shared';
import { paths, readJson, writeJson } from './store';

export type MediaItem = {
  url: string;
  name: string;
  size: number;
  source: 'product' | 'hero' | 'contact' | 'media' | 'sync' | 'catalog';
  uploadedAt: string;
};

export const WEB_PUBLIC = path.resolve(process.cwd(), '..', 'web', 'public');
const MAX_ITEMS = 5000;

/** 扫描目录（相对 web/public）→ 来源标记；imports 下的批次图片单独扫描 */
const SCAN_DIRS: { rel: string; source: MediaItem['source'] }[] = [
  { rel: 'assets/media', source: 'media' },
  { rel: 'assets/hero/uploads', source: 'hero' },
  { rel: 'assets/contact', source: 'contact' },
];

function readMedia(): MediaItem[] {
  return readJson<MediaItem[]>(paths.media, []);
}

/** url → web/public 下的绝对路径（防路径穿越，文件不存在返回 null） */
export function mediaUrlToFile(url: string): string | null {
  if (!url.startsWith('/') || url.includes('\0')) return null;
  const abs = path.resolve(WEB_PUBLIC, decodeURIComponent(url.replace(/^\/+/, '')));
  if (!abs.startsWith(WEB_PUBLIC + path.sep)) return null;
  return abs;
}

/** 登记上传记录（按 url 去重，新的在前） */
export function registerMedia(
  entries: { url: string; name?: string; size?: number }[],
  source: MediaItem['source'],
): void {
  const valid = entries.filter(e => e.url && e.url.startsWith('/'));
  if (!valid.length) return;
  const list = readMedia();
  const known = new Set(list.map(m => m.url));
  const now = new Date().toISOString();
  const fresh: MediaItem[] = valid
    .filter(e => !known.has(e.url))
    .map(e => ({
      url: e.url,
      name: (e.name && path.basename(e.name)) || path.posix.basename(e.url),
      size: Math.max(0, Math.round(e.size || 0)),
      source,
      uploadedAt: now,
    }));
  if (!fresh.length) return;
  writeJson(paths.media, [...fresh, ...list].slice(0, MAX_ITEMS));
}

/** 从索引移除（不删文件） */
export function removeMedia(url: string): void {
  writeJson(paths.media, readMedia().filter(m => m.url !== url));
}

/** 递归收集目录下的图片文件 */
function walkImages(dir: string, urlPrefix: string, out: { url: string; name: string; size: number }[]): void {
  const IMG_RE = /\.(jpe?g|png|webp|avif)$/i;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of entries) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) {
      walkImages(abs, `${urlPrefix}/${d.name}`, out);
    } else if (IMG_RE.test(d.name)) {
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { /* ignore */ }
      out.push({ url: `${urlPrefix}/${d.name}`, name: d.name, size });
    }
  }
}

/**
 * 同步图库：兜底登记上传目录中的遗漏文件，清理文件已不存在的条目。
 * 每次图库读取时执行（目录规模小，开销可忽略）。
 */
export function syncMedia(): MediaItem[] {
  const list = readMedia();
  const known = new Set(list.map(m => m.url));

  // 1) 清理失效条目（文件已被删除 / 回滚批次清空）
  const alive = list.filter(m => {
    const file = mediaUrlToFile(m.url);
    return file !== null && fs.existsSync(file);
  });

  // 2) 扫描 imports 全部子目录（批量导入 + 手动上传的 img_ 目录）
  const found: { url: string; name: string; size: number }[] = [];
  const importsDir = path.join(WEB_PUBLIC, 'imports');
  try {
    for (const d of fs.readdirSync(importsDir, { withFileTypes: true })) {
      if (d.isDirectory()) walkImages(path.join(importsDir, d.name), `/imports/${d.name}`, found);
    }
  } catch { /* 目录不存在 */ }
  // 3) 扫描 assets 下的上传目录
  for (const { rel } of SCAN_DIRS) {
    walkImages(path.join(WEB_PUBLIC, rel), `/${rel}`, found);
  }

  const fresh: MediaItem[] = found
    .filter(f => !known.has(f.url))
    .map(f => ({
      url: f.url,
      name: f.name,
      size: f.size,
      source: 'sync' as const,
      uploadedAt: new Date().toISOString(),
    }));

  const next = [...fresh, ...alive].slice(0, MAX_ITEMS);
  if (fresh.length || alive.length !== list.length) writeJson(paths.media, next);
  return next;
}

/** 列表入口：先同步再返回 */
export function listMediaItems(): MediaItem[] {
  return syncMedia();
}

/**
 * 商品数据集主图（外链）→ catalog 条目。
 * 数据集为自动生成的只读数据，条目实时合成、不写 media.json；
 * 同图多个商品共用主图时按数据集顺序去重。
 */
function catalogMediaItems(): MediaItem[] {
  // 已删除 / 草稿 / 归档的商品不再进图库（后台删除商品后条目自动消失）
  const overrides = readJson<Record<string, { status?: string; deleted?: boolean }>>(paths.overrides, {});
  const visible = (h: string) => {
    const o = overrides[h];
    if (!o) return true;
    return !o.deleted && o.status !== 'draft' && o.status !== 'archived';
  };
  const out: MediaItem[] = [];
  const seen = new Set<string>();
  for (const p of PRODUCTS) {
    const url = p.v;
    if (!url || seen.has(url)) continue;
    if (!visible(p.h)) continue;
    seen.add(url);
    out.push({ url, name: p.t, size: 0, source: 'catalog', uploadedAt: '' });
  }
  return out;
}

/** 全量列表：本地上传在前，商品主图（外链）在后；url 已去重（本地上传优先） */
export function listAllMediaItems(): MediaItem[] {
  const local = listMediaItems();
  const known = new Set(local.map(m => m.url));
  return [...local, ...catalogMediaItems().filter(m => !known.has(m.url))];
}

/**
 * 删除保护：url 是否被商品 / 覆盖 / 店铺设置引用。
 * 返回引用位置描述（如「商品 KIT-xxx」），未引用返回 null。
 */
export function mediaUrlInUse(url: string): string | null {
  const imported = readJson<Record<string, any>[]>(paths.imported, []);
  for (const p of imported) {
    const imgs: string[] = Array.isArray(p.i) ? p.i : [];
    if (imgs.includes(url) || p.v === url) return `商品 ${p.sku || p.h || ''}`.trim();
  }
  const overrides = readJson<Record<string, { images?: string[] }>>(paths.overrides, {});
  for (const [handle, ov] of Object.entries(overrides)) {
    if (ov.images?.includes(url)) return `商品（覆盖值 ${handle}）`;
  }
  const settings = readJson<Record<string, any>>(paths.settings, {});
  const heroSlides: { image?: string }[] = settings.hero?.slides || [];
  if (heroSlides.some(s => s.image === url)) return '商店设置（Hero 轮播）';
  if (settings.brand?.supportQr === url) return '商店设置（客服二维码）';
  const armbands: { image?: string }[] = settings.customize?.armband?.options || [];
  if (armbands.some(o => o.image === url)) return '商店设置（商品定制）';
  const reviews: { avatar?: string }[] = settings.reviews?.reviews || [];
  if (reviews.some(r => r.avatar === url)) return '商店设置（客户评价）';
  return null;
}
