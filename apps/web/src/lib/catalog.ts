import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES, CATEGORY_GROUPS, type SlimProduct, type Category } from '@kitvault/shared';
import { dbReadAllCatalog } from './db-store';

/**
 * 商品目录（前台数据源，K-S0-4 起查 SQLite 库）
 * 组成：采集自 chenyikan.shop 的数据集（种子入 Product 表，ext.src='dataset'）
 *       + 后台导入的商品（Product 表导入域）——将来主站同步商品也落同一张表
 *       + 后台覆盖：上架状态 / 改价 / 改标题（data/admin/overrides.json，仍走文件）
 * 上架默认 active；软删（archived）行不出库。
 */

export type ProductOverride = {
  status?: 'active' | 'draft' | 'archived';
  priceUsd?: number;
  comparePriceUsd?: number;
  title?: string;
  /** 单品删除标记：删除后前台彻底隐藏（采集商品无法物理删除，用覆盖标记） */
  deleted?: boolean;
  /** 描述覆盖 */
  description?: string;
  /** 尺码列表覆盖 */
  sizes?: string[];
  /** 分类覆盖（前台归类用，多选） */
  cl?: string[];
  /** 图片列表覆盖（第一张为主图） */
  images?: string[];
};

const OVERRIDES_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'overrides.json');

// mtime 缓存：后台写文件后前台下一次请求自动生效，无需重启
type CacheEntry<T> = { mtimeMs: number; data: T } | null;
let ovCache: CacheEntry<Record<string, ProductOverride>> = null;

function readCached<T>(file: string, cache: CacheEntry<T>, parse: (raw: string) => T, empty: T): { entry: CacheEntry<T>; data: T } {
  try {
    const st = fs.statSync(file);
    if (cache && cache.mtimeMs === st.mtimeMs) return { entry: cache, data: cache.data };
    const entry = { mtimeMs: st.mtimeMs, data: parse(fs.readFileSync(file, 'utf8')) };
    return { entry, data: entry.data };
  } catch {
    const entry = { mtimeMs: 0, data: empty };
    return { entry, data: empty };
  }
}

export function loadOverrides(): Record<string, ProductOverride> {
  const r = readCached(OVERRIDES_PATH, ovCache, raw => JSON.parse(raw) as Record<string, ProductOverride>, {});
  ovCache = r.entry;
  return r.data;
}

// 目录库读缓存（TTL 5s）：全表 ~3.7k 行，避免每请求重复 JSON.parse；后台导入/同步后最迟 5s 生效
let catalogCache: { at: number; data: SlimProduct[] } | null = null;
const CATALOG_TTL_MS = 5000;

export function loadCatalog(): SlimProduct[] {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.data;
  const data = dbReadAllCatalog() as unknown as SlimProduct[];
  catalogCache = { at: now, data };
  return data;
}

/** 全部商品（采集 + 导入），应用后台覆盖；已删除的单品不返回 */
export function allProducts(): SlimProduct[] {
  const ov = loadOverrides();
  const apply = (p: SlimProduct): SlimProduct => {
    const o = ov[p.h];
    if (!o) return p;
    const next: SlimProduct = {
      ...p,
      ...(o.title ? { t: o.title } : {}),
      ...(o.priceUsd ? { p: o.priceUsd } : {}),
      ...(o.comparePriceUsd ? { c: o.comparePriceUsd } : {}),
      ...(o.description !== undefined ? { d: o.description } : {}),
      ...(Array.isArray(o.sizes) && o.sizes.length ? { s: o.sizes } : {}),
      ...(Array.isArray(o.cl) && o.cl.length ? { cl: o.cl } : {}),
      ...(Array.isArray(o.images) && o.images.length ? { i: o.images, v: o.images[0] } : {}),
    };
    // 划线价变动后重算折扣百分比（展示用），与导入商品同规则
    if (o.comparePriceUsd !== undefined) {
      next.o = next.c > next.p ? Math.round((1 - next.p / next.c) * 100) : 0;
    }
    return next;
  };
  return loadCatalog().map(apply).filter(p => !ov[p.h]?.deleted);
}

/** 是否上架（默认上架；后台可下架/归档） */
export function isActive(p: SlimProduct): boolean {
  return (loadOverrides()[p.h]?.status ?? 'active') === 'active';
}

/** 按分类取商品（只含上架商品） */
export function productsByCollection(slug: string, limit = 48, sort: 'sales' | 'price-asc' | 'price-desc' | 'new' = 'sales'): SlimProduct[] {
  let list = allProducts().filter(p => p.cl.includes(slug) && isActive(p));
  if (sort === 'sales') list = list.sort((a, b) => b.sa - a.sa);
  if (sort === 'price-asc') list = list.sort((a, b) => a.p - b.p);
  if (sort === 'price-desc') list = list.sort((a, b) => b.p - a.p);
  return list.slice(0, limit);
}

export function productByHandle(handle: string): SlimProduct | undefined {
  return allProducts().find(p => p.h === handle);
}

/** 同球队/同分类的相似商品 */
export function similarProducts(product: SlimProduct, limit = 4): SlimProduct[] {
  const pool = allProducts().filter(p => p.h !== product.h && isActive(p) && p.cl.some(c => product.cl.includes(c)));
  return (pool.length ? pool : allProducts().filter(p => p.h !== product.h && isActive(p))).slice(0, limit);
}

export function featured(limit = 8): SlimProduct[] {
  return allProducts().filter(isActive).sort((a, b) => b.sa - a.sa).slice(0, limit);
}

export function heroShots(): SlimProduct[] {
  const pick = (slug: string, i: number) => {
    const list = productsByCollection(slug, 30);
    return list[i % Math.max(1, list.length)];
  };
  const shots = [pick('2026-27-season', 0), pick('retro', 3), pick('2026-27-season', 7)].filter(Boolean);
  return shots.length ? shots : featured(3);
}

export function categoryBySlug(slug: string) {
  return CATEGORIES.find(c => c.slug === slug);
}

/**
 * 分类分组（首页 / 国家队 / 俱乐部 hub 用）
 * 件数为实时在售数量：反映后台上架 / 下架 / 删除与分类覆盖，
 * 与 /collections/[slug] 实际展示的数量一致（静态快照 count 会滞后）。
 */
export function groups() {
  const counts = new Map<string, number>();
  for (const p of allProducts()) {
    if (!isActive(p)) continue;
    for (const slug of p.cl) counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const patch = (list: Category[]) =>
    list
      .map(c => ({ ...c, count: counts.get(c.slug) ?? 0 }))
      .filter(c => c.count > 0); // 没有在售商品的分类直接不展示
  return Object.fromEntries(
    Object.entries(CATEGORY_GROUPS).map(([k, list]) => [k, patch(list)]),
  ) as Record<string, Category[]>;
}
