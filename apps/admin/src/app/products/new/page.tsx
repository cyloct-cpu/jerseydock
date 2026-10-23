import Link from 'next/link';
import { createProduct, requirePage } from '@/lib/actions';
import { ProductImagesEditor } from '@/components/ProductImagesEditor';
import { CounterInput } from '@/components/CounterInput';
import { MultiSelect } from '@/components/MultiSelect';
import { SIZE_OPTIONS, CATEGORY_OPTIONS } from '@/lib/options';

export const dynamic = 'force-dynamic';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'YS', 'YM', 'YL', 'YXL'];
const TYPES: [string, string][] = [
  ['home', '主场'], ['away', '客场'], ['third', '第三球衣'],
  ['gk', '门将'], ['training', '训练'], ['retro', '复古'],
];
const VERSIONS: [string, string][] = [
  ['fan', '球迷版'], ['player', '球员版'], ['kids', '儿童'],
];

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePage('/products/new');
  const sp = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalog · New</span>
          <h1 style={{ marginTop: 6 }}>新增商品</h1>
          <div className="sub">
            校验规则与批量导入一致（尺码 XS–5XL / 儿童 16–28 · 分类必须存在 · 至少 1 张图）· 图片支持本机上传与图库选取
          </div>
        </div>
        <Link className="btn btn-ghost" href="/products">返回商品列表</Link>
      </div>

      {sp.error && <div className="notice bad">{sp.error}</div>}

      <form action={createProduct} style={{ display: 'grid', gap: 16, maxWidth: 980 }}>
        {/* 商品图片 */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">商品图片</span>
          <div style={{ marginTop: 14 }}>
            <ProductImagesEditor
              initial={[]}
            />
          </div>
        </div>

        {/* 基本信息 */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">基本信息</span>
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>SKU（必填，唯一）</label>
              <input className="input" name="sku" required placeholder="KV-2026-ARS-HOME-001" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>商品名称（必填）</label>
              <CounterInput name="title" maxLength={128} required placeholder="2026-27 Arsenal Home Shirt" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>赛季</label>
                <input className="input" name="season" placeholder="2026-27" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>球队</label>
                <input className="input" name="team" placeholder="Arsenal" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>联赛</label>
                <input className="input" name="league" placeholder="Premier League" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>类型</label>
                <select className="select" name="type" defaultValue="home">
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>版本</label>
                <select className="select" name="version" defaultValue="fan">
                  {VERSIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>分类（可多选，决定前台归类）</label>
                <div style={{ marginTop: 2 }}>
                  <MultiSelect name="categories" options={CATEGORY_OPTIONS} placeholder="选择分类…" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 价格 · 库存 · 尺码 */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">价格 · 库存 · 尺码</span>
          <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>售价 USD（必填）</label>
                <input className="input" name="priceUsd" type="number" min="0.01" step="0.01" required placeholder="40.00" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>原价 USD（划线价，选填）</label>
                <input className="input" name="comparePriceUsd" type="number" min="0" step="0.01" placeholder="129.00" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>库存</label>
                <input className="input" name="stock" type="number" min="0" step="1" defaultValue="0" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>尺码（至少选 1 个）</label>
              <div style={{ marginTop: 2 }}>
                <MultiSelect name="sizes" options={SIZE_OPTIONS} placeholder="选择尺码…" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>商品描述</label>
              <textarea className="input" name="description" rows={4} placeholder="商品详情文案，可留空" />
            </div>
          </div>
        </div>

        {/* 提交 */}
        <div className="a-card a-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>上架状态</label>
            <div style={{ display: 'flex', gap: 14, marginTop: 2 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="radio" name="status" value="draft" defaultChecked style={{ accentColor: 'var(--accent)' }} /> 草稿（稍后上架）
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="radio" name="status" value="active" style={{ accentColor: 'var(--accent)' }} /> 直接上架
              </label>
            </div>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <Link className="btn btn-ghost" href="/products">取消</Link>
          <button className="btn" type="submit">保存商品</button>
        </div>
      </form>
    </>
  );
}
