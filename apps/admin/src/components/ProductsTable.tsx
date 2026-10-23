'use client';

import Link from 'next/link';
import { useState } from 'react';
import { bulkProducts, bulkPrice, deleteProduct, updateProduct } from '@/lib/actions';

export type ProductRow = {
  handle: string;
  title: string;
  sku: string;
  price: number;
  compare: number;
  status: 'active' | 'draft' | 'archived' | 'deleted';
  source: 'scraped' | 'imported';
  image: string;
  version: string;
  stock: number;
  /** 上品时间：导入 = importedAt；采集 = 数据集批次时间 */
  listedAt?: string;
};

const STATUS_LABEL: Record<string, string> = { active: '已上架', draft: '草稿', archived: '已归档', deleted: '已删除' };

/** handle 展示截断（完整值在 title 悬浮） */
function shortHandle(h: string): string {
  return h.length > 30 ? `${h.slice(0, 30)}…` : h;
}

export function ProductsTable({ rows, baseQuery }: { rows: ProductRow[]; baseQuery: string }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (h: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  };
  const toggleAll = () => {
    setChecked(prev => (prev.size === rows.length ? new Set() : new Set(rows.map(r => r.handle))));
  };

  return (
    <>
      {checked.size > 0 && (
        <div className="notice" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>已选 <b style={{ color: 'var(--accent)' }}>{checked.size}</b> 件</span>
            {(['activate', 'deactivate', 'archive'] as const).map(action => (
              <form key={action} action={bulkProducts}>
                <input type="hidden" name="handles" value={[...checked].join(',')} />
                <input type="hidden" name="action" value={action} />
                <button className={`btn btn-sm${action === 'archive' ? ' btn-danger' : ' btn-ghost'}`} type="submit">
                  {action === 'activate' ? '批量上架' : action === 'deactivate' ? '批量下架' : '批量归档（删除）'}
                </button>
              </form>
            ))}
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setChecked(new Set())}>取消选择</button>
          </div>

          {/* 批量改价：固定 / 加减金额 / 升降百分比 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>批量改价</span>
            <form action={bulkPrice} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="hidden" name="handles" value={[...checked].join(',')} />
              <input type="hidden" name="field" value="price" />
              <select className="select" name="mode" style={{ height: 30, width: 150 }} defaultValue="set" aria-label="改价方式">
                <option value="set">设为固定价 $</option>
                <option value="inc">加价 $</option>
                <option value="dec">减价 $</option>
                <option value="incPct">上调 %</option>
                <option value="decPct">下调 %</option>
              </select>
              <input className="input" name="value" type="number" step="0.01" placeholder="数值" style={{ width: 90, height: 30 }} required />
              <button className="btn btn-sm" type="submit">应用到已选</button>
            </form>
          </div>

          {/* 批量设优惠（划线原价）：固定金额 / 折扣百分比 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>批量设优惠（划线原价）</span>
            <form action={bulkPrice} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="hidden" name="handles" value={[...checked].join(',')} />
              <input type="hidden" name="field" value="compare" />
              <select className="select" name="mode" style={{ height: 30, width: 190 }} defaultValue="pct" aria-label="优惠方式">
                <option value="pct">按折扣 %（30 = 7 折）</option>
                <option value="set">设为固定原价 $</option>
              </select>
              <input className="input" name="value" type="number" step="0.01" min="0" placeholder="数值" style={{ width: 90, height: 30 }} required />
              <button className="btn btn-sm" type="submit">应用到已选</button>
              <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>按现价自动算出划线原价</span>
            </form>
          </div>
        </div>
      )}

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox" checked={rows.length > 0 && checked.size === rows.length} onChange={toggleAll} aria-label="全选" />
              </th>
              <th style={{ width: 60 }}>图片</th>
              <th>商品</th>
              <th style={{ minWidth: 320 }}>操作</th>
              <th>SKU</th>
              <th>价格</th>
              <th>状态</th>
              <th>来源</th>
              <th>上品时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.handle}>
                <td>
                  <input type="checkbox" checked={checked.has(r.handle)} onChange={() => toggle(r.handle)} aria-label={`选择 ${r.title}`} />
                </td>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="a-thumb" src={r.image} alt="" loading="lazy" />
                </td>
                <td className="wrap">
                  <a href={`/products/${r.handle}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)' }}>{r.title}</a>
                  <div className="mono dim" style={{ whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.handle}>
                    {shortHandle(r.handle)}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link className="btn btn-sm" href={`/products/${encodeURIComponent(r.handle)}/edit`}>编辑</Link>
                    {r.status === 'deleted' ? (
                      <form action={bulkProducts}>
                        <input type="hidden" name="handles" value={r.handle} />
                        <input type="hidden" name="action" value="activate" />
                        <button className="btn btn-sm" type="submit">恢复上架</button>
                      </form>
                    ) : (
                      <>
                        {r.status !== 'active' && (
                          <form action={bulkProducts}>
                            <input type="hidden" name="handles" value={r.handle} />
                            <input type="hidden" name="action" value="activate" />
                            <button className="btn btn-sm" type="submit">上架</button>
                          </form>
                        )}
                        {r.status === 'active' && (
                          <form action={bulkProducts}>
                            <input type="hidden" name="handles" value={r.handle} />
                            <input type="hidden" name="action" value="deactivate" />
                            <button className="btn btn-sm btn-ghost" type="submit">下架</button>
                          </form>
                        )}
                      </>
                    )}
                    <form action={updateProduct} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="hidden" name="handle" value={r.handle} />
                      <input className="input" name="price" type="number" step="0.01" min="0" defaultValue={r.price} style={{ width: 70, height: 28 }} aria-label={`${r.title} 售价`} />
                      <input className="input" name="compare" type="number" step="0.01" min="0" defaultValue={r.compare || ''} placeholder="原价" style={{ width: 70, height: 28 }} aria-label={`${r.title} 划线原价`} />
                      <button className="btn btn-sm btn-ghost" type="submit">存价</button>
                    </form>
                    <form
                      action={deleteProduct}
                      onSubmit={e => { if (!window.confirm(`确定删除「${r.title}」？\n${r.source === 'imported' ? '导入商品将被物理移除。' : '采集商品将从前台隐藏，可通过「恢复上架」还原。'}`)) e.preventDefault(); }}
                    >
                      <input type="hidden" name="handle" value={r.handle} />
                      <input type="hidden" name="source" value={r.source} />
                      <button className="btn btn-sm btn-danger" type="submit">删除</button>
                    </form>
                  </div>
                </td>
                <td className="mono">{r.sku || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  ${r.price.toFixed(2)}
                  {r.compare > r.price && <span className="dim" style={{ textDecoration: 'line-through', marginLeft: 6 }}>${r.compare.toFixed(2)}</span>}
                </td>
                <td>
                  <span className={`badge ${r.status === 'active' ? 'ok' : r.status === 'draft' ? 'warn' : 'bad'}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td>
                  <span className="badge plain">{r.source === 'imported' ? '导入' : '采集'}</span>
                  {r.source === 'imported' && r.stock > 0 && <div className="dim" style={{ marginTop: 4 }}>库存 {r.stock}</div>}
                </td>
                <td className="dim" style={{ whiteSpace: 'nowrap', fontSize: 'var(--fs-small)' }}>
                  {r.listedAt ? new Date(r.listedAt).toLocaleDateString('zh-CN') : '—'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9}><div className="empty">没有匹配的商品</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {baseQuery && (
        <div className="pager">
          <span className="dim" style={{ alignSelf: 'center', marginRight: 6 }}>翻页：</span>
          {baseQuery.split('|').map(seg => (
            <a key={seg} className="btn btn-ghost btn-sm" href={seg}>{seg.match(/page=(\d+)/)?.[1] ?? '?'}</a>
          ))}
        </div>
      )}
    </>
  );
}
