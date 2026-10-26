/**
 * 主站商品同步消费端（K-S2，开发执行文档 §12.3）
 * 协议：GET <主站>/api/sync/catalog?cursor=<seq>&limit=<n>，Bearer settings.sync.token
 * 返回 { entries: [{ seq, op: 'upsert'|'delete', contentHash, product? }], nextCursor }
 * - upsert：contentHash 与库中 ext.syncHash 相同则跳过；不同则重建本店 SlimProduct 同构 ext（src:'sync'）
 * - delete：tombstone → 库 status='archived' 软删（只动同步域）
 * - 媒体：先查共享目录（文件名=hash），命中零拷贝；未命中按 URL 补拉落盘并校验 bytes
 * - 本店差异（CatalogOverride 表）：价格 priceUsd/价格系数 priceFactor、标题、上下架在落库时应用
 * web/admin 两份同内容（与 db-store 同镜像约定）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CATEGORIES } from '@kitvault/shared';
import {
  dbGetSyncCursor, dbSetSyncCursor, dbGetSyncHash,
  dbUpsertSyncProduct, dbArchiveSyncProduct, dbGetCatalogOverride,
} from './db-store';

export const SYNC_SOURCE = 'jerseyshelf';

/** 本店已知分类 slug:主站分类与本店不一致时过滤,避免 /collections/<未知slug> 404 */
const KNOWN_COLLECTIONS = new Set(CATEGORIES.map(c => c.slug));

// ---------------- 契约类型（以主站实现为准，K-S2-5 联调时核对） ----------------

export type SyncMedia = { hash: string; ext: string; bytes: number; url: string };

export type SyncProduct = {
  slug: string;
  titleEn: string;
  description?: string;
  basePriceUsd: number;
  comparePriceUsd?: number | null;
  sizes?: string[];
  collections?: string[];
  /** 主站状态；archived 等价 tombstone */
  status?: 'active' | 'draft' | 'archived';
  customization?: { textOn?: boolean; armbandOn?: boolean; textFeeUsd?: number; armbandFeeUsd?: number };
  media: SyncMedia[];
};

export type SyncEntry = { seq: number; op: 'upsert' | 'delete'; contentHash: string; product?: SyncProduct };
export type SyncPage = { entries: SyncEntry[]; nextCursor: number | null };

// ---------------- 配置（data/admin/settings.json → sync 节） ----------------

export type SyncSettings = {
  enabled: boolean;
  baseUrl: string;       // 主站源，如 https://jerseyshelf.com
  token: string;         // 主站 /api/sync/catalog 的访问令牌
  sharedMediaDir?: string; // 共享图库目录；空 = <repo>/shared-media/（开发态），生产挂 /srv/media
  intervalMinutes?: number; // 定时拉取间隔，默认 10
  lastResult?: SyncStats & { at: string; ok: boolean };
};

const SETTINGS_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json');

export function loadSyncSettings(): SyncSettings {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return { enabled: false, baseUrl: '', token: '', ...s?.sync };
  } catch {
    return { enabled: false, baseUrl: '', token: '' };
  }
}

export function saveSyncSettings(patch: Partial<SyncSettings>): void {
  const doc = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  doc.sync = { ...loadSyncSettings(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(doc, null, 2), 'utf8');
}

function sharedMediaDir(): string {
  const cfg = loadSyncSettings();
  return cfg.sharedMediaDir || path.resolve(process.cwd(), '..', '..', 'shared-media');
}

// ---------------- 本店差异（CatalogOverride） ----------------

function loadOverride(slug: string): { priceUsd?: number | null; priceFactor?: number | null; titleEn?: string | null; status?: string | null } {
  try {
    return dbGetCatalogOverride(slug) ?? {};
  } catch {
    return {};
  }
}

// ---------------- 媒体：共享目录命中零拷贝 / 未命中补拉落盘 ----------------

async function ensureMedia(items: SyncMedia[], stats: SyncStats): Promise<void> {
  const dir = sharedMediaDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const m of items || []) {
    if (!m?.hash || !m?.url) continue;
    const file = path.join(dir, `${m.hash}.${m.ext || 'jpg'}`);
    if (fs.existsSync(file)) {
      stats.mediaSkipped++;
      continue;
    }
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (m.bytes && buf.length !== m.bytes) throw new Error(`bytes mismatch: expect ${m.bytes} got ${buf.length}`);
      fs.writeFileSync(file, buf);
      stats.mediaFetched++;
    } catch (e) {
      stats.mediaFailed++;
      stats.errors.push(`media ${m.hash.slice(0, 8)}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

// ---------------- 落库 ----------------

/** SyncProduct + 本店差异 → SlimProduct 同构 ext（前台 catalog 无需感知同步域） */
function buildExt(entry: SyncEntry, localMediaBase: string): string {
  const p = entry.product as SyncProduct;
  const ov = loadOverride(p.slug);
  const base = Number(p.basePriceUsd) || 0;
  const price = ov.priceUsd != null ? Number(ov.priceUsd)
    : ov.priceFactor != null ? Math.round(base * Number(ov.priceFactor) * 100) / 100
    : base;
  const compare = p.comparePriceUsd != null ? Number(p.comparePriceUsd) : null;
  // 图片：共享媒体以 /media/<hash> 暴露（本店路由）；按主站 media 顺序
  const images = (p.media || []).map(m => `${localMediaBase}${m.hash}`);
  const o = compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;
  const knownCl = (p.collections || []).filter(c => KNOWN_COLLECTIONS.has(c));
  const slim = {
    h: p.slug,
    t: ov.titleEn || p.titleEn,
    p: price,
    c: compare,
    o,
    s: p.sizes || ['S', 'M', 'L', 'XL', '2XL'],
    i: images,
    v: images[0] ?? '',
    sa: 0,
    cl: knownCl.length ? knownCl : ['other'],
    d: p.description || '',
    sku: p.slug,
  };
  return JSON.stringify({
    src: 'sync',
    syncHash: entry.contentHash,
    masterSeq: entry.seq,
    sync: p,
    customization: p.customization ?? null,
    ...slim,
  });
}

const localMediaBase = (): string => '/media/';

// ---------------- 拉取主流程 ----------------

export type SyncStats = {
  fetched: number; upserted: number; skipped: number; deleted: number;
  mediaFetched: number; mediaSkipped: number; mediaFailed: number;
  cursor: number; errors: string[];
};

export async function pullCatalog(cfg: SyncSettings, maxPages = 50): Promise<SyncStats> {
  const stats: SyncStats = { fetched: 0, upserted: 0, skipped: 0, deleted: 0, mediaFetched: 0, mediaSkipped: 0, mediaFailed: 0, cursor: dbGetSyncCursor(SYNC_SOURCE), errors: [] };
  let cursor = stats.cursor;
  const base = `${String(cfg.baseUrl || '').replace(/\/+$/, '')}/api/sync/catalog`;

  for (let page = 0; page < maxPages; page++) {
    const u = `${base}?cursor=${cursor}&limit=200`;
    const res = await fetch(u, { headers: { Authorization: `Bearer ${cfg.token}` } });
    if (!res.ok) throw new Error(`master ${res.status} ${res.statusText}`);
    const data = await res.json() as SyncPage;
    const entries = data.entries || [];
    if (!entries.length) break;

    for (const entry of entries) {
      stats.fetched++;
      cursor = Math.max(cursor, entry.seq); // 游标推进对所有 op 生效(含 delete)
      try {
        if (entry.op === 'delete' || entry.product?.status === 'archived') {
          if (dbArchiveSyncProduct(entry.product?.slug || '')) stats.deleted++;
          continue;
        }
        if (!entry.product) continue;
        if (dbGetSyncHash(entry.product.slug) === entry.contentHash) {
          stats.skipped++; // 内容未变，幂等跳过
        } else {
          await ensureMedia(entry.product.media || [], stats);
          dbUpsertSyncProduct({
            slug: entry.product.slug,
            titleEn: entry.product.titleEn,
            basePriceUsd: Number(entry.product.basePriceUsd) || 0,
            comparePriceUsd: entry.product.comparePriceUsd ?? null,
            images: (entry.product.media || []).map(m => `${localMediaBase()}${m.hash}`),
            status: entry.product.status === 'draft' ? 'draft' : 'active',
            ext: buildExt(entry, localMediaBase()),
          });
          stats.upserted++;
        }
      } catch (e) {
        stats.errors.push(`seq ${entry.seq}: ${e instanceof Error ? e.message : e}`);
      }
    }
    dbSetSyncCursor(SYNC_SOURCE, cursor);
    stats.cursor = cursor;
    if (data.nextCursor == null || data.nextCursor <= cursor) break;
  }
  return stats;
}

/** 定时器/手动触发的安全入口：enabled 与 token 校验、异常记入 lastResult */
export async function pullCatalogSafe(): Promise<SyncStats | { error: string }> {
  const cfg = loadSyncSettings();
  if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return { error: 'sync disabled or not configured' };
  try {
    const stats = await pullCatalog(cfg);
    saveSyncSettings({ lastResult: { ...stats, at: new Date().toISOString(), ok: true } });
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { saveSyncSettings({ lastResult: { fetched: 0, upserted: 0, skipped: 0, deleted: 0, mediaFetched: 0, mediaSkipped: 0, mediaFailed: 0, cursor: 0, errors: [msg], at: new Date().toISOString(), ok: false } }); } catch { /* ignore */ }
    return { error: msg };
  }
}

/** 定时器（web instrumentation 调用；globalThis 锁防 dev 热重载重复起） */
export function ensureSyncTimer(): void {
  const g = globalThis as { __kvSyncTimerStarted?: boolean };
  if (g.__kvSyncTimerStarted) return;
  g.__kvSyncTimerStarted = true;
  const tick = () => { void pullCatalogSafe(); };
  setTimeout(tick, 30 * 1000); // 启动半分钟后先试一次
  const minutes = loadSyncSettings().intervalMinutes || 10;
  setInterval(tick, minutes * 60 * 1000).unref();
}

export const syncTestHelpers = { sharedMediaDir, hashOf: (s: string) => crypto.createHash('sha256').update(s).digest('hex') };
