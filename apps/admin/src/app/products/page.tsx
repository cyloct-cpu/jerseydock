import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCTS } from '@kitvault/shared';
import { paths, readJson } from '@/lib/store';
import { ProductsTable, type ProductRow } from '@/components/ProductsTable';
import { requirePage } from '@/lib/actions';

export const dynamic = 'force-dynamic';

type Imported = {
  h: string; t: string; p: number; c: number; v: string;
  sku?: string; version?: string; stock?: number; batchId?: string;
  importedAt?: string;
};

const PER_PAGE = 50;

type Override = {
  status?: 'active' | 'draft' | 'archived';
  listedAt?: string;
  priceUsd?: number;
  comparePriceUsd?: number;
  deleted?: boolean;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; listed?: string; page?: string; imported?: string; batch?: string; created?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  await requirePage('/products');
  const sp = await searchParams;
  const q = (sp.q || '').trim().toLowerCase();
  const status = sp.status || '';
  const source = sp.source || '';
  const listed = sp.listed || '';
  const page = Math.max(1, Number(sp.page || 1));

  // 采集商品的上品时间 = 数据集构建时间（同一批次）；有 override.listedAt 时以后台记录为准
  const DATASET_FILE = path.resolve(process.cwd(), '..', '..', 'data', 'clean', 'products.json');
  const datasetDate = fs.existsSync(DATASET_FILE) ? fs.statSync(DATASET_FILE).mtime.toISOString() : '';

  const overrides = readJson<Record<string, Override>>(paths.overrides, {});
  const imported = readJson<Imported[]>(paths.imported, []);

  const rows: ProductRow[] = [
    ...PRODUCTS.map(p => {
      const ov = overrides[p.h];
      return {
        handle: p.h,
        title: p.t,
        sku: '',
        price: ov?.priceUsd ?? p.p,
        compare: ov?.comparePriceUsd ?? p.c,
        status: ov?.deleted ? ('deleted' as const) : ov?.status ?? 'active',
        source: 'scraped' as const,
        listedAt: ov?.listedAt || datasetDate,
        image: p.v || p.i[0] || '',
        version: '',
        stock: 0,
      };
    }),
    ...imported.map(p => {
      const ov = overrides[p.h];
      return {
        handle: p.h,
        title: p.t,
        sku: p.sku || '',
        price: ov?.priceUsd ?? p.p,
        compare: ov?.comparePriceUsd ?? p.c,
        status: ov?.deleted ? ('deleted' as const) : ov?.status ?? 'active',
        source: 'imported' as const,
        listedAt: p.importedAt || '',
        image: p.v || '',
        version: p.version || '',
        stock: p.stock || 0,
      };
    }),
  ];

  const filtered = rows.filter(r => {
    if (q && !(`${r.title} ${r.handle} ${r.sku}`.toLowerCase().includes(q))) return false;
    if (status && r.status !== status) return false;
    if (source && r.source !== source) return false;
    if (listed) {
      const t = r.listedAt ? new Date(r.listedAt).getTime() : 0;
      const now = Date.now();
      const ranges: Record<string, [number, number]> = {
        today: [now - 864e5, now + 6e5],
        '7d': [now - 7 * 864e5, now + 6e5],
        '30d': [now - 30 * 864e5, now + 6e5],
        '90d': [now - 90 * 864e5, now + 6e5],
        older: [0, now - 90 * 864e5],
      };
      const [lo, hi] = ranges[listed] || [0, now + 6e5];
      if (!(t >= lo && t <= hi)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (status) qs.set('status', status);
  if (source) qs.set('source', source);
  if (listed) qs.set('listed', listed);
  const base = qs.toString();
  const pageLinks: string[] = [];
  const win = 2;
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - safePage) <= win) {
      pageLinks.push(`/products?${base}${base ? '&' : ''}page=${n}`);
    } else if (pageLinks[pageLinks.length - 1] !== '…') {
      pageLinks.push('…');
    }
  }
  const baseQuery = totalPages > 1 ? pageLinks.filter(l => l !== '…').join('|') : '';

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1 style={{ marginTop: 6 }}>商品管理</h1>
          <div className="sub">
            共 {rows.length} 件（采集 {PRODUCTS.length} + 导入 {imported.length}）· 当前筛选 {filtered.length} 件 · 第 {safePage}/{totalPages} 页
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn" href="/products/new">新增商品</Link>
          <Link className="btn btn-ghost" href="/products/import">批量导入</Link>
        </div>
      </div>

      {sp.created && (
        <div className="notice ok">已保存「{sp.created}」— 可在下方列表继续改价 / 上下架。</div>
      )}

      {sp.saved && (
        <div className="notice ok">已保存「{sp.saved}」的修改，前台即时生效。</div>
      )}

      {sp.deleted && (
        <div className="notice ok">已删除 {decodeURIComponent(sp.deleted).slice(0, 60)}…（采集商品可通过「恢复上架」还原）</div>
      )}

      {sp.error && <div className="notice bad">{sp.error}</div>}

      {sp.imported && (
        <div className="notice ok">导入完成：{sp.imported} 件已入库（批次 {sp.batch}），默认草稿状态 — 勾选后点「批量上架」即可开卖。</div>
      )}

      <form className="toolbar" method="get" action="/products">
        <div className="field" style={{ minWidth: 240 }}>
          <label>搜索（标题 / handle / SKU）</label>
          <input className="input" name="q" defaultValue={sp.q || ''} placeholder="arsenal home 2026…" />
        </div>
        <div className="field">
          <label>状态</label>
          <select className="select" name="status" defaultValue={status}>
            <option value="">全部</option>
            <option value="active">已上架</option>
            <option value="draft">草稿</option>
            <option value="archived">已归档</option>
            <option value="deleted">已删除</option>
          </select>
        </div>
        <div className="field">
          <label>来源</label>
          <select className="select" name="source" defaultValue={source}>
            <option value="">全部</option>
            <option value="scraped">采集</option>
            <option value="imported">导入</option>
          </select>
        </div>
        <div className="field">
          <label>上品时间</label>
          <select className="select" name="listed" defaultValue={listed}>
            <option value="">全部</option>
            <option value="today">今天</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="90d">近 90 天</option>
            <option value="older">90 天前</option>
          </select>
        </div>
        <button className="btn" type="submit">筛选</button>
        {(q || status || source) && <Link className="btn btn-ghost" href="/products">重置</Link>}
      </form>

      <ProductsTable rows={pageRows} baseQuery={baseQuery} />
    </>
  );
}
