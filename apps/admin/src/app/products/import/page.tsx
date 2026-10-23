import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '@kitvault/shared';
import { paths, readJson } from '@/lib/store';
import { parseProductList, validateRow } from '@/lib/import-parse';
import { runImport, rollbackImport, deleteImportFolder, requirePage } from '@/lib/actions';
import { UploadBox } from '@/components/UploadBox';

export const dynamic = 'force-dynamic';

const IMG_EXT_RE = /\.(jpe?g|png|webp|avif)$/i;

type Batch = {
  id: string;
  folderName: string;
  productCount: number;
  failed?: { sku: string; errors: string[] }[];
  createdAt: string;
};

type FolderInfo = {
  name: string;
  hasList: boolean;
  listName: string;
  imageCount: number;
  rowCount: number;
  imported: boolean;
};

const LIST_ACCEPT = '.csv,.json,text/csv,application/json';

/** 字段规范表：与 lib/import-parse.ts 的 HEADER_ALIASES / validateRow 保持一致 */
const FIELD_SPEC: { name: string; cn: string; required: boolean; format: string; note: string }[] = [
  { name: 'batch_no', cn: '编号', required: false, format: '文本，如 1 / 2 / A01', note: '图片子目录名。与该编号的子目录自动配对；留空则按 image_folder / sku 匹配' },
  { name: 'sku', cn: 'SKU编号', required: true, format: '文本，全表唯一', note: '商品编号（与图片目录无关，独立字段）' },
  { name: 'title', cn: '标题', required: true, format: '文本', note: '前台商品标题与详情页标题' },
  { name: 'season', cn: '赛季', required: false, format: '文本，Excel 有下拉', note: '用于前台归类与筛选' },
  { name: 'team', cn: '球队', required: false, format: '文本，Excel 有下拉（78 项）', note: '俱乐部 / 国家队' },
  { name: 'league', cn: '联赛', required: false, format: '文本，Excel 有下拉（11 项）', note: '联赛名称' },
  { name: 'type', cn: '类型', required: false, format: 'home / away / third / gk / training / retro', note: '球衣类型，留空默认 home' },
  { name: 'version', cn: '版本', required: false, format: 'fan / player / kids', note: '球迷版 / 球员版 / 儿童版，留空默认 fan' },
  { name: 'price_usd', cn: '价格', required: true, format: '数字，需 > 0，单位 USD', note: '前台基准售价（其他货币按汇率换算）' },
  { name: 'compare_price_usd', cn: '原价', required: false, format: '数字，需大于售价', note: '划线价，用于显示折扣；小于等于售价会被忽略' },
  { name: 'size_range', cn: '尺码', required: true, format: '空格/逗号分隔，Excel 有 12 种组合下拉', note: '合法值：XS S M L XL 2XL 3XL 4XL YS YM YL YXL' },
  { name: 'stock', cn: '库存', required: false, format: '整数，≥ 0', note: '仅后台展示，留空按 0 处理' },
  { name: 'description', cn: '描述', required: false, format: '文本', note: '前台商品详情文案' },
  { name: 'category', cn: '分类', required: false, format: '分类 slug，Excel 有 138 项下拉', note: '不确定时看「分类字典」，或留空不归类' },
  { name: 'image_folder', cn: '图片目录', required: false, format: '文本，缺省等于 SKU', note: '编号列留空时，用它匹配图片子目录' },
  { name: 'image_urls', cn: '图片链接', required: false, format: '多张用逗号分隔的完整 URL', note: '与上传图片二选一或混用；两者都没有会判为「无图片」' },
];

/** 扫描 data/imports 下的批次文件夹，统计清单、图片与行数 */
function listFolders(): FolderInfo[] {
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(paths.imports, { withFileTypes: true }).filter(d => d.isDirectory());
  } catch {
    return [];
  }
  const batches = readJson<Batch[]>(paths.importBatches, []);
  const doneFolders = new Set(batches.map(b => b.folderName));

  return dirs.map(d => {
    const dir = path.join(paths.imports, d.name);
    const csv = path.join(dir, 'products.csv');
    const json = path.join(dir, 'products.json');
    const listName = fs.existsSync(csv) ? 'products.csv' : fs.existsSync(json) ? 'products.json' : '';

    let imageCount = 0;
    try {
      const imgRoot = path.join(dir, 'images');
      imageCount = fs.readdirSync(imgRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .reduce((sum, e) => {
          try {
            return sum + fs.readdirSync(path.join(imgRoot, e.name))
              .filter(f => IMG_EXT_RE.test(f)).length;
          } catch {
            return sum;
          }
        }, 0);
    } catch {
      imageCount = 0;
    }

    let rowCount = 0;
    if (listName) {
      try {
        const text = fs.readFileSync(path.join(dir, listName), 'utf8');
        rowCount = parseProductList(text, listName.endsWith('.json') ? 'json' : 'csv').length;
      } catch {
        rowCount = 0;
      }
    }

    return {
      name: d.name,
      hasList: Boolean(listName),
      listName,
      imageCount,
      rowCount,
      imported: doneFolders.has(d.name),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; error?: string; warn?: string }>;
}) {
  await requirePage('/products/import');
  const sp = await searchParams;
  const folders = listFolders();
  const batches = readJson<Batch[]>(paths.importBatches, []);
  const categorySlugs = new Set(CATEGORIES.map(c => c.slug));

  // 第 2 步：预览（解析 + 校验，不写入）
  let preview: ReturnType<typeof validateRow>[] = [];
  const folder = sp.folder || '';
  if (folder) {
    const dir = path.join(paths.imports, folder);
    try {
      let text = '';
      let format: 'csv' | 'json' = 'csv';
      if (fs.existsSync(path.join(dir, 'products.csv'))) text = fs.readFileSync(path.join(dir, 'products.csv'), 'utf8');
      else if (fs.existsSync(path.join(dir, 'products.json'))) { text = fs.readFileSync(path.join(dir, 'products.json'), 'utf8'); format = 'json'; }
      const rows = parseProductList(text, format);
      preview = rows.map((r, i) =>
        validateRow(r, i, {
          categorySlugs,
          localImages: key => {
            try {
              return fs.readdirSync(path.join(dir, 'images', key)).filter(f => IMG_EXT_RE.test(f));
            } catch {
              return [];
            }
          },
          localUrlPrefix: '/imports/PREVIEW',
        })
      );
    } catch {
      preview = [];
    }
  }

  const okCount = preview.filter(r => !r.errors.length).length;
  const badCount = preview.length - okCount;
  const current = folders.find(f => f.name === folder);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalog · Import</span>
          <h1 style={{ marginTop: 6 }}>批量导入</h1>
          <div className="sub">上传清单文件（CSV / JSON）→ 校验预览 → 确认入库。导入后默认草稿，需在商品管理勾选上架。</div>
        </div>
        <Link className="btn btn-ghost" href="/products">返回商品列表</Link>
      </div>

      {/* 步骤条 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { n: '1', label: '上传清单与图片', on: true },
          { n: '2', label: '校验预览', on: Boolean(folder && preview.length > 0) },
          { n: '3', label: '确认入库', on: false },
        ].map((st, i) => (
          <span key={st.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && <span className="dim" aria-hidden>→</span>}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              border: `1px solid ${st.on ? 'var(--accent)' : 'var(--line-2)'}`,
              color: st.on ? 'var(--accent)' : 'var(--text-3)',
              borderRadius: 999, padding: '4px 14px 4px 6px', fontSize: 'var(--fs-small)',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: st.on ? 'var(--accent)' : 'var(--line-2)', color: '#0A0A0B', fontWeight: 600, fontSize: 11,
              }}>{st.n}</span>
              {st.label}
            </span>
          </span>
        ))}
      </div>

      {(sp.error || (folder && preview.length === 0)) && (
        <div className="notice bad">{sp.error || '该批次文件夹内没有可解析的 products.csv / products.json'}</div>
      )}
      {sp.warn && <div className="notice">{sp.warn}</div>}

      {/* ---------- 第 1 步：上传清单 + 图片 ---------- */}
      <div className="a-card a-card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span className="eyebrow">第 1 步 · 上传清单与图片</span>
            <div className="dim" style={{ marginTop: 6, fontSize: 'var(--fs-small)', maxWidth: 560 }}>
              下载 Excel 模板填好编号 / SKU / 标题等信息 → 选整个图片文件夹上传 →
              系统按「编号」自动把 <span className="mono">1/</span> 配给编号 1 的那行，无需手动填图片。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn" href="/api/template?format=xlsx">下载 Excel 模板</a>
            <a className="btn btn-ghost btn-sm" href="/api/template?format=csv">CSV</a>
            <a className="btn btn-ghost btn-sm" href="/api/template?format=json">JSON</a>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <UploadBox />
        </div>

        <div className="notice" style={{ marginTop: 16, marginBottom: 0 }}>
          <b>图片目录约定</b>：文件夹内每个子目录名 = 清单里的 <span className="mono">编号</span> 列。
          子目录内 <span className="mono">1.jpg 2.jpg 3.jpg</span> 按数字顺序作为主图集，
          <span className="mono">S1.jpg S2.jpg</span> 作为 S 图排在后面（当前不绑定尺码）。编号留空则退回按 SKU 匹配。
        </div>
      </div>

      {/* ---------- 字段规范（默认折叠） ---------- */}
      <details className="a-card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ cursor: 'pointer' }}>字段规范（点击展开）</span>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>
            Excel 模板中 赛季 / 球队 / 联赛 / 类型 / 版本 / 尺码 / 分类 均带下拉，可直接选择无需手填 · 类型 / 版本 / 分类 支持中文填写
          </span>
        </summary>
        <div className="a-table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
          <table className="a-table">
            <thead>
              <tr>
                <th style={{ minWidth: 190 }}>列名（英文 / 中文）</th>
                <th style={{ width: 70 }}>必填</th>
                <th>格式与取值</th>
                <th style={{ minWidth: 160 }}>说明</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_SPEC.map(f => (
                <tr key={f.name}>
                  <td>
                    <span className="mono">{f.name}</span>
                    {f.cn && <span className="dim" style={{ marginLeft: 6 }}>/ {f.cn}</span>}
                  </td>
                  <td>{f.required ? <span className="badge bad">必填</span> : <span className="dim">—</span>}</td>
                  <td className="wrap" style={{ color: 'var(--text-2)' }}>{f.format}</td>
                  <td className="wrap dim">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* ---------- 批次工作区 ---------- */}
      <div className="a-card" style={{ marginTop: 16 }}>
        <div className="a-card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span className="eyebrow">批次工作区（data/imports/）</span>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{folders.length} 个文件夹</span>
        </div>
        {folders.length ? (
          <div className="a-table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
            <table className="a-table">
              <thead>
                <tr><th>批次名称</th><th>清单</th><th>商品行数</th><th>本地图片</th><th>状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                {folders.map(f => (
                  <tr key={f.name} className={f.name === folder ? 'imp-row-ok' : undefined}>
                    <td className="mono" style={{ whiteSpace: 'normal' }}>
                      {f.name}
                      {f.name === folder && <span className="badge ok" style={{ marginLeft: 8 }}>当前查看</span>}
                    </td>
                    <td>{f.hasList ? <span className="mono">{f.listName}</span> : <span className="badge bad">缺少清单</span>}</td>
                    <td>{f.rowCount || '—'}</td>
                    <td>{f.imageCount || '—'}</td>
                    <td>
                      {f.imported
                        ? <span className="badge ok">已导入</span>
                        : f.hasList
                          ? <span className="badge warn">待导入</span>
                          : <span className="badge plain">空文件夹</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link className="btn btn-sm btn-ghost" href={`/products/import?folder=${encodeURIComponent(f.name)}`}>预览</Link>
                        {!f.imported && (
                          <form action={deleteImportFolder}>
                            <input type="hidden" name="folder" value={f.name} />
                            <button className="btn btn-sm btn-danger" type="submit">删除</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">data/imports/ 还没有批次 — 用上方表单上传清单文件即可开始</div>
        )}
      </div>

      {/* ---------- 第 2 步：校验预览 ---------- */}
      {folder && preview.length > 0 && (
        <div className="a-card" style={{ marginTop: 16 }}>
          <div className="a-card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <span className="eyebrow">第 2 步 · 校验预览 · {folder}</span>
              <div style={{ marginTop: 8, fontSize: 'var(--fs-small)' }}>
                <span className="badge ok">{okCount} 行可导入</span>{' '}
                {badCount > 0 && <span className="badge bad">{badCount} 行有问题（不会入库）</span>}
                {current?.imageCount ? <span className="badge plain" style={{ marginLeft: 6 }}>本地图片 {current.imageCount} 张</span> : null}
              </div>
            </div>
            <form action={runImport}>
              <input type="hidden" name="folder" value={folder} />
              <button className="btn" type="submit" disabled={okCount === 0}>确认导入 {okCount} 件（草稿）</button>
            </form>
          </div>
          <div className="a-table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
            <table className="a-table">
              <thead>
                <tr>
                  <th>#</th><th style={{ width: 62 }}>编号</th><th>SKU</th><th>标题</th><th>价格</th><th>尺码</th><th>分类</th>
                  <th style={{ minWidth: 210 }}>配对图片</th><th style={{ minWidth: 150 }}>校验</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const mainCount = r.mainImages.length;
                  const shotCount = r.skuShotImages.length;
                  return (
                    <tr key={i} className={r.errors.length ? 'imp-row-bad' : 'imp-row-ok'}>
                      <td className="dim">{i + 1}</td>
                      <td className="mono">{r.batchNo || <span className="dim">按SKU</span>}</td>
                      <td className="mono">{r.sku || '—'}</td>
                      <td className="wrap" style={{ color: 'var(--text)' }}>{r.title || '—'}</td>
                      <td>{r.priceUsd ? `$${r.priceUsd.toFixed(2)}` : '—'}</td>
                      <td>{r.sizes.join(' ') || '—'}</td>
                      <td>{r.category || '—'}</td>
                      <td>
                        {r.images.length ? (
                          <span style={{ fontSize: 'var(--fs-micro)' }}>
                            {mainCount > 0 && <span className="badge ok">主图 {mainCount}</span>}
                            {mainCount > 0 && shotCount > 0 && ' '}
                            {shotCount > 0 && <span className="badge plain">S 图 {shotCount}</span>}
                            {!mainCount && shotCount > 0 && <span className="badge warn">仅 S 图</span>}
                            <div className="dim" style={{ marginTop: 4, wordBreak: 'break-all' }}>
                              {r.imageFiles.slice(0, 6).join(' ')}{r.imageFiles.length > 6 ? ` +${r.imageFiles.length - 6}` : ''}
                            </div>
                          </span>
                        ) : (
                          <span className="dim">未配到</span>
                        )}
                      </td>
                      <td className="imp-errors">{r.errors.length ? r.errors.join('；') : <span style={{ color: 'var(--ok)' }}>OK</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- 导入批次记录 ---------- */}
      <div className="a-card" style={{ marginTop: 16 }}>
        <div className="a-card-pad">
          <span className="eyebrow">导入批次记录（可回滚）</span>
          {batches.length ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {batches.map(b => (
                <div key={b.id} className="mini-row" style={{ alignItems: 'center' }}>
                  <span>
                    <b>{b.folderName}</b>
                    <span className="dim"> · {b.productCount} 件 · {new Date(b.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                    {b.failed && b.failed.length > 0 && <span className="badge bad" style={{ marginLeft: 8 }}>{b.failed.length} 行未通过</span>}
                  </span>
                  <form action={rollbackImport}>
                    <input type="hidden" name="batchId" value={b.id} />
                    <button className="btn btn-sm btn-danger" type="submit">回滚</button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="dim" style={{ marginTop: 12 }}>还没有导入记录。</p>
          )}
        </div>
      </div>
    </>
  );
}
