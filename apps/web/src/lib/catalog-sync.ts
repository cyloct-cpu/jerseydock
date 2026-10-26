/**
 * 主站商品同步消费端（K-S2；K-S2-5 起按 jerseyshelf 主站真实实现适配）
 *
 * 真实协议（主站 apps/api/catalog-sync.mjs + server.mjs:160，以此为准）：
 *   GET <base>/api/sync/catalog?token=<令牌>&cursor=<seq>&limit=200[&full=1]
 *   → { changes: [{ seq, op: 'product'|'collection', payload }], cursor, latest, publicBase }
 *   - payload.contentHash：主站已算（32 hex），本店存 ext.syncHash 做幂等
 *   - 价格单位为**分**（1700 = $17.00），本店落库转美元
 *   - 无 delete op：主站下架 = payload.active=false → 本店 status='draft'；分类 deleted=true 跳过
 *   - 媒体：payload.images = [{hash,name,contentType,bytes,path:'/media/<hash>.<ext>'}]，
 *     URL = <publicBase||baseUrl> + path；共享目录（文件名=<hash>.<ext>）命中零拷贝，未命中补拉
 *   - full=1：主站一次性快照（seq=0 的全量 changes，cursor=latest）；游标为 0 时自动走快照
 *
 * 本店差异（CatalogOverride 表）：价格 priceUsd/系数 priceFactor、标题，落库时应用。
 * web/admin 两份同内容（与 db-store 同镜像约定）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '@kitvault/shared';
import {
  dbGetSyncCursor, dbSetSyncCursor, dbGetSyncHash,
  dbUpsertSyncProduct, dbUpsertSyncCollection, dbGetCatalogOverride,
} from './db-store';

export const SYNC_SOURCE = 'jerseyshelf';

/** 本店已知分类 slug（shared 常量）：主站分类落 Category 表，但前台归类仍以本店目录为准 */
const KNOWN_COLLECTIONS = new Set(CATEGORIES.map(c => c.slug));

// ---------------- 主站契约类型 ----------------

type MasterMedia = { hash: string; name: string; contentType: string; bytes: number; path: string };
type MasterVariant = { sku: string; label: string; price: number; stock: number; active: boolean };
type MasterProduct = {
  kind: 'product'; slug: string; title: string; description: string;
  price: number; comparePrice: number | null; active: boolean;
  images: MasterMedia[]; searchKeywords: string;
  customization: Record<string, unknown>;
  translations: Record<string, { title?: string; description?: string }>;
  recommendationMode: string; collections: string[];
  variants: MasterVariant[]; contentHash: string;
};
type MasterCollection = {
  kind: 'collection'; slug: string; name: string; kindKey: string; position: number;
  image: MasterMedia | null; teamGroup: string; deleted: boolean; contentHash?: string;
};
type MasterEntry = { seq: number; op: 'product' | 'collection'; payload: MasterProduct | MasterCollection };
type MasterPage = { changes: MasterEntry[]; cursor: number; latest: number; publicBase: string };

// ---------------- 配置（data/admin/settings.json → sync 节） ----------------

export type SyncSettings = {
  enabled: boolean;
  baseUrl: string;
  token: string;
  sharedMediaDir?: string;
  intervalMinutes?: number;
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

// ---------------- 媒体：共享目录命中零拷贝 / 未命中按 URL 补拉落盘 ----------------

function extOf(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

async function ensureMedia(items: MasterMedia[], base: string, stats: SyncStats): Promise<void> {
  const dir = sharedMediaDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const m of items || []) {
    if (!m?.hash || !m?.path) continue;
    const file = path.join(dir, `${m.hash}.${extOf(m.contentType)}`);
    if (fs.existsSync(file)) {
      stats.mediaSkipped++;
      continue;
    }
    try {
      const res = await fetch(`${base}${m.path}`);
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

// ---------------- 商品/分类落库 ----------------

const PLACEHOLDER_SIZE = '规格待核实';

/** 主站 payload → 本店 ext（SlimProduct 同构，src='sync'） */
function buildProductExt(p: MasterProduct, entry: MasterEntry, mediaBase: string, stats: SyncStats): string {
  const ov: { priceUsd?: number | null; priceFactor?: number | null; titleEn?: string | null; status?: string | null } = dbGetCatalogOverride(p.slug) ?? {};
  const base = (Number(p.price) || 0) / 100; // 主站单位：分
  const price = ov.priceUsd != null ? Number(ov.priceUsd)
    : ov.priceFactor != null ? Math.round(base * Number(ov.priceFactor) * 100) / 100
    : base;
  const compare = p.comparePrice != null ? Number(p.comparePrice) / 100 : null;
  const o = compare && compare > price ? Math.round((1 - price / compare) * 100) : 0;
  const media = (p.images || []).filter(Boolean);
  // 本店图片一律相对路径 /media/<hash>.<ext>：走本店路由（共享目录命中读文件/未命中已补拉副本），绝不热链主站
  const images = media.map(m => m.path); // /media/<hash>.<ext>，本店同路径约定
  const variantLabels = [...new Set((p.variants || []).map(v => String(v.label || '').trim()).filter(l => l && l !== PLACEHOLDER_SIZE))];
  const enT = p.translations?.en?.title;
  const enD = p.translations?.en?.description;
  const knownCl = (p.collections || []).filter(c => KNOWN_COLLECTIONS.has(c));
  const slim = {
    h: p.slug,
    t: ov.titleEn || enT || p.title,
    p: price,
    c: compare,
    o,
    s: variantLabels.length ? variantLabels : ['S', 'M', 'L', 'XL', '2XL'],
    i: images,
    v: images[0] ?? '',
    sa: 0,
    cl: knownCl.length ? knownCl : ['other'],
    d: enD || p.description || '',
    sku: p.slug,
  };
  if (media.length) stats.mediaSeen += media.length;
  return JSON.stringify({
    src: 'sync',
    syncHash: p.contentHash,
    masterSeq: entry.seq,
    sync: p,
    customization: p.customization ?? null,
    ...slim,
  });
}

/** 类型映射：主站 kind(club/national/other)与本店 Category.type 值域兼容，原值直存 */
const ACCEPTED_KINDS = new Set(['national', 'club', 'season', 'retro', 'kids', 'outerwear', 'shorts', 'other']);

// ---------------- 拉取主流程 ----------------

export type SyncStats = {
  fetched: number; upserted: number; skipped: number; deleted: number;
  collectionsSynced: number; collectionsSkippedDeleted: number;
  mediaSeen: number; mediaFetched: number; mediaSkipped: number; mediaFailed: number;
  cursor: number; latest: number; errors: string[];
};

export async function pullCatalog(cfg: SyncSettings, maxPages = 300): Promise<SyncStats> {
  const stats: SyncStats = { fetched: 0, upserted: 0, skipped: 0, deleted: 0, collectionsSynced: 0, collectionsSkippedDeleted: 0, mediaSeen: 0, mediaFetched: 0, mediaSkipped: 0, mediaFailed: 0, cursor: dbGetSyncCursor(SYNC_SOURCE), latest: 0, errors: [] };
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  let cursor = stats.cursor;

  for (let page = 0; page < maxPages; page++) {
    const full = cursor === 0 ? '&full=1' : ''; // 首连/清零后走主站全量快照
    const u = `${base}/api/sync/catalog?token=${encodeURIComponent(cfg.token)}&cursor=${cursor}&limit=200${full}`;
    const res = await fetch(u);
    if (!res.ok) throw new Error(`master ${res.status} ${res.statusText}`);
    const data = await res.json() as MasterPage;
    const changes = data.changes || [];
    // 补拉媒体始终走本店配置的主站地址（publicBase 是主站对外地址，本地/内网联调时可能配错端口）
    const mediaBase = base;

    for (const entry of changes) {
      stats.fetched++;
      try {
        if (entry.op === 'collection') {
          const c = entry.payload as MasterCollection;
          if (c.deleted) { stats.collectionsSkippedDeleted++; continue; }
          const type = ACCEPTED_KINDS.has(c.kindKey) ? c.kindKey : 'other';
          const ext = JSON.stringify({ src: 'sync', teamGroup: c.teamGroup || '', image: c.image?.path ?? null });
          dbUpsertSyncCollection({ slug: c.slug, nameEn: c.name, type, sort: Number(c.position) || 0, ext });
          stats.collectionsSynced++;
          continue;
        }
        const p = entry.payload as MasterProduct;
        if (!p?.slug) continue;
        if (dbGetSyncHash(p.slug) === p.contentHash) {
          stats.skipped++; // 内容未变，幂等跳过
        } else {
          await ensureMedia(p.images || [], mediaBase, stats);
          dbUpsertSyncProduct({
            slug: p.slug,
            titleEn: p.translations?.en?.title || p.title,
            basePriceUsd: (Number(p.price) || 0) / 100,
            comparePriceUsd: p.comparePrice != null ? Number(p.comparePrice) / 100 : null,
            images: (p.images || []).filter(Boolean).map(m => m.path),
            status: p.active ? 'active' : 'draft', // 主站下架=本店 draft（前台 isActive 不展示）
            ext: buildProductExt(p, entry, mediaBase, stats),
          });
          stats.upserted++;
        }
      } catch (e) {
        stats.errors.push(`seq ${entry.seq} ${entry.op}: ${e instanceof Error ? e.message : e}`);
      }
    }

    cursor = data.cursor ?? cursor; // 主站计算游标（本页最后 seq；快照=latest）
    dbSetSyncCursor(SYNC_SOURCE, cursor);
    stats.cursor = cursor;
    stats.latest = data.latest ?? 0;
    // 快照一次返回全部（seq=0），游标已到 latest；增量模式 cursor<latest 才继续翻页
    if (cursor >= (data.latest ?? 0) || !changes.length) break;
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
    try { saveSyncSettings({ lastResult: { fetched: 0, upserted: 0, skipped: 0, deleted: 0, collectionsSynced: 0, collectionsSkippedDeleted: 0, mediaSeen: 0, mediaFetched: 0, mediaSkipped: 0, mediaFailed: 0, cursor: 0, latest: 0, errors: [msg], at: new Date().toISOString(), ok: false } }); } catch { /* ignore */ }
    return { error: msg };
  }
}

/** 定时器（web instrumentation 调用；globalThis 锁防 dev 热重载重复起） */
export function ensureSyncTimer(): void {
  const g = globalThis as { __kvSyncTimerStarted?: boolean };
  if (g.__kvSyncTimerStarted) return;
  g.__kvSyncTimerStarted = true;
  const tick = () => { void pullCatalogSafe(); };
  setTimeout(tick, 30 * 1000);
  const minutes = loadSyncSettings().intervalMinutes || 10;
  setInterval(tick, minutes * 60 * 1000).unref();
}
