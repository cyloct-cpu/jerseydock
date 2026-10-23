import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PRODUCTS } from '@kitvault/shared';
import { paths, readJson } from '@/lib/store';
import { editProduct, requirePage } from '@/lib/actions';
import { ProductImagesEditor } from '@/components/ProductImagesEditor';
import { CounterInput } from '@/components/CounterInput';
import { MultiSelect } from '@/components/MultiSelect';
import { SIZE_OPTIONS, CATEGORY_OPTIONS } from '@/lib/options';

export const dynamic = 'force-dynamic';

type Override = {
  status?: 'active' | 'draft' | 'archived';
  priceUsd?: number;
  comparePriceUsd?: number;
  title?: string;
  deleted?: boolean;
  description?: string;
  sizes?: string[];
  cl?: string[];
  images?: string[];
};

type ImportedRec = {
  h: string; t: string; p: number; c: number; o?: number; s: string[];
  i: string[]; v: string; d?: string; cl?: string[];
  sku?: string; version?: string; stock?: number; batchId?: string;
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePage('/products');
  const { handle } = await params;
  const { error } = await searchParams;

  const overrides = readJson<Record<string, Override>>(paths.overrides, {});
  const imported = readJson<ImportedRec[]>(paths.imported, []);
  const rec = imported.find(p => p.h === handle);
  const scraped = PRODUCTS.find(p => p.h === handle);
  if (!rec && !scraped) notFound();

  const ov = overrides[handle] || {};
  const source = rec ? 'imported' : 'scraped';

  // 当前生效值 = 原始数据 + 覆盖
  const title = ov.title || (rec ? rec.t : scraped!.t);
  const price = ov.priceUsd ?? (rec ? rec.p : scraped!.p);
  const compare = ov.comparePriceUsd ?? (rec ? rec.c : scraped!.c);
  const status = ov.status ?? (rec ? 'draft' : 'active');
  const description = ov.description ?? (rec ? rec.d || '' : scraped!.d || '');
  const sizes = (ov.sizes && ov.sizes.length ? ov.sizes : rec ? rec.s : scraped!.s) || [];
  const images = (ov.images && ov.images.length ? ov.images : rec ? rec.i || (rec.v ? [rec.v] : []) : scraped!.i) || [];
  const categories = (ov.cl && ov.cl.length ? ov.cl : rec ? rec.cl : scraped!.cl) || [];

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalog · 编辑商品</span>
          <h1 style={{ marginTop: 6, fontSize: 22 }}>{title}</h1>
          <div className="sub mono" style={{ wordBreak: 'break-all' }}>{handle}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link className="btn btn-ghost" href={`/products/${handle}`} target="_blank">前台查看 ↗</Link>
          <Link className="btn btn-ghost" href="/products">返回列表</Link>
        </div>
      </div>

      {error && <div className="notice bad">{error}</div>}

      {ov.deleted && (
        <div className="notice" style={{ marginBottom: 14 }}>
          该商品当前处于<b>已删除</b>状态（前台不展示）。保存本表单即可恢复。
        </div>
      )}

      {source === 'scraped' && (
        <div className="notice" style={{ marginBottom: 14 }}>
          采集商品的原始数据来自源站快照 — 本页保存为<b>覆盖值</b>（标题 / 价格 / 原价 / 描述 / 尺码 / 分类 / 图片 / 状态），前台即时生效。
        </div>
      )}

      <form action={editProduct} style={{ display: 'grid', gap: 16, maxWidth: 980 }}>
        <input type="hidden" name="handle" value={handle} />
        <input type="hidden" name="source" value={source} />

        {/* 商品图片 */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">商品图片</span>
          <div style={{ marginTop: 14 }}>
            <ProductImagesEditor
              initial={images}
            />
          </div>
        </div>

        {/* 基本信息 */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">基本信息</span>
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>商品名称</label>
              <CounterInput name="title" defaultValue={title} maxLength={128} required placeholder="2025-26 Arsenal Home Shirt" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>售价（USD）</label>
                <input className="input" name="price" type="number" step="0.01" min="0.01" required defaultValue={price} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>原价（划线价，0 = 不展示）</label>
                <input className="input" name="compare" type="number" step="0.01" min="0" defaultValue={compare} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>状态</label>
                <select className="select" name="status" defaultValue={status}>
                  <option value="active">已上架</option>
                  <option value="draft">草稿（前台不展示）</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>分类（可多选，决定前台归类）</label>
                <div style={{ marginTop: 2 }}>
                  <MultiSelect name="categories" options={CATEGORY_OPTIONS} initial={categories} placeholder="选择分类…" hint={`已选 ${categories.length} 项 · 点击外部关闭`} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>尺码（可多选）</label>
                <div style={{ marginTop: 2 }}>
                  <MultiSelect name="sizes" options={SIZE_OPTIONS} initial={sizes} allowCustom placeholder="选择尺码…" />
                </div>
              </div>
              {source === 'imported' ? (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>版本</label>
                  <input className="input" name="version" defaultValue={rec!.version || ''} placeholder="Fan / Player / Kids" />
                </div>
              ) : (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>来源</label>
                  <input className="input" value="采集（源站快照）" disabled />
                </div>
              )}
            </div>
            {source === 'imported' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>SKU</label>
                  <input className="input" value={rec!.sku || '—'} disabled />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>库存</label>
                  <input className="input" name="stock" type="number" min="0" step="1" defaultValue={rec!.stock || 0} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>导入批次</label>
                  <input className="input" value={rec!.batchId || '—'} disabled />
                </div>
              </div>
            )}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>商品描述</label>
              <textarea className="input" name="description" rows={5} defaultValue={description} maxLength={3000} placeholder="面料、版本说明、洗护建议…" />
            </div>
          </div>
        </div>

        <div className="a-card a-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button className="btn" type="submit">保存修改</button>
          <Link className="btn btn-ghost" href="/products">取消</Link>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>
            保存会同时清除该商品的「已删除」标记（如曾被删除则自动恢复）。
          </span>
        </div>
      </form>
    </>
  );
}
