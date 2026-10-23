/**
 * 批量导入解析（需求 N3，文件夹式）
 * 目录约定：data/imports/<系列>/{products.csv|products.json, images/<sku>/*, meta.json?}
 *
 * CSV 列（中英文表头均可，见 HEADER_ALIASES）：
 *   sku, title, season, team, league, type, version,
 *   price_usd, compare_price_usd, size_range, stock, description,
 *   category, image_folder, image_urls
 */

import { CATEGORIES, CATEGORY_CN, resolveCategorySlug } from '@kitvault/shared';

export type RawRow = Record<string, string>;

export type ValidatedRow = {
  /** 清单里的「编号」，用于与图片子文件夹配对；留空则退回 sku / image_folder */
  batchNo: string;
  sku: string;
  title: string;
  season: string;
  team: string;
  league: string;
  type: string;
  version: string;
  priceUsd: number;
  comparePriceUsd: number;
  sizes: string[];
  stock: number;
  description: string;
  category: string;
  /** 分类（支持多选，category 的拆分形式） */
  categories: string[];
  imageFolder: string;
  imageUrls: string[];
  images: string[];   // 最终图集（主图在前，S 图在后）
  mainImages: string[];
  skuShotImages: string[];
  imageFiles: string[]; // 原始文件名（后台展示用）
  handle: string;
  errors: string[];
};

const VALID_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'XXL', 'XXXL', 'YS', 'YM', 'YL', 'YXL', '16', '18', '20', '22', '24', '26', '28'];
const VALID_TYPES = ['home', 'away', 'third', 'gk', 'training', 'retro'];
const VALID_VERSIONS = ['fan', 'player', 'kids'];

/** 类型/版本中英文对照：模板与后台都用中文填写，存储仍为规范英文码 */
const TYPE_CN: Record<string, string> = {
  '主场': 'home', '客场': 'away', '第二客场': 'away',
  '第三': 'third', '第三球衣': 'third', '二客': 'third',
  '门将': 'gk', '守门员': 'gk',
  '训练': 'training', '训练服': 'training',
  '复古': 'retro', '怀旧': 'retro',
};
const VERSION_CN: Record<string, string> = {
  '球迷': 'fan', '球迷版': 'fan', '粉丝版': 'fan',
  '球员': 'player', '球员版': 'player',
  '儿童': 'kids', '儿童版': 'kids', ' kids': 'kids',
};

/** 兼容「球员版(player)」「主场(home)」这类中英混合写法（模板下拉就是这种格式）：去掉括号备注与空白再匹配 */
function stripParenNote(v: string): string {
  return String(v || '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '');
}

/** 类型归一：英文码 / 中文 / 中英混合均接受 */
function normType(v: string): string {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const t = raw.toLowerCase();
  if (VALID_TYPES.includes(t)) return t;
  const stripped = stripParenNote(raw);
  const st = stripped.toLowerCase();
  if (VALID_TYPES.includes(st)) return st;
  return TYPE_CN[stripped] || TYPE_CN[raw] || t;
}
/** 版本归一：英文码 / 中文 / 中英混合均接受 */
function normVersion(v: string): string {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const t = raw.toLowerCase();
  if (VALID_VERSIONS.includes(t)) return t;
  const stripped = stripParenNote(raw);
  const st = stripped.toLowerCase();
  if (VALID_VERSIONS.includes(st)) return st;
  return VERSION_CN[stripped] || VERSION_CN[raw] || t;
}
/** 分类归一：slug / 英文名 / 中文名 均可，识别不到原样返回（由校验报错） */
function normCategory(v: string): string {
  const c = String(v || '').trim();
  if (!c) return '';
  return resolveCategorySlug(c, CATEGORIES) || c;
}

const HEADER_ALIASES: Record<string, string> = {
  sku: 'sku', 'sku编号': 'sku', '商品编号': 'sku',
  batch_no: 'batch_no', '编号': 'batch_no', '图片编号': 'batch_no', 'folder': 'batch_no', 'folder_no': 'batch_no',
  title: 'title', '标题': 'title', name: 'title',
  season: 'season', '赛季': 'season',
  team: 'team', '球队': 'team',
  league: 'league', '联赛': 'league',
  type: 'type', '类型': 'type',
  version: 'version', '版本': 'version',
  price_usd: 'price_usd', 'price': 'price_usd', '价格': 'price_usd',
  compare_price_usd: 'compare_price_usd', '原价': 'compare_price_usd',
  size_range: 'size_range', '尺码': 'size_range', sizes: 'size_range',
  stock: 'stock', '库存': 'stock',
  description: 'description', '描述': 'description',
  category: 'category', '分类': 'category',
  image_folder: 'image_folder', '图片目录': 'image_folder',
  image_urls: 'image_urls', '图片链接': 'image_urls',
};

/**
 * 表头归一：清理模板里的必填星号、空格与括号备注，再做别名匹配。
 * 例：「标题 *」「价格 (必填)」「  SKU  」→ 标题 / 价格 / sku
 */
export function normalizeHeader(h: string): string {
  return h
    .replace(/[（(][^）)]*[）)]/g, '')  // 去掉括号备注
    .replace(/[*＊]/g, '')                // 去掉必填星号
    .replace(/\s+/g, '')                  // 去掉所有空白
    .trim();
}

function headerKey(h: string): string {
  const cleaned = normalizeHeader(h).toLowerCase();
  return HEADER_ALIASES[cleaned] || cleaned;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** RFC4180 简易 CSV 解析（支持引号内逗号/换行） */
export function parseCsv(text: string): RawRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v.trim() !== '')) rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => {
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      obj[headerKey(h)] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

function normalizeRow(r: RawRow): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(r)) {
    out[headerKey(k)] = v;
  }
  return out;
}

/** 单元格取值：兼容富文本（模板的金色表头）/ 公式 / 超链接 / 日期 / 普通值 */
function cellText(cell: any): string {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: { text?: string }) => String(r?.text ?? '')).join('');
    }
    if ('formula' in (v as Record<string, unknown>)) return String((v as any).result ?? '');
    if ('hyperlink' in (v as Record<string, unknown>)) return String((v as any).text ?? '');
    return String(v);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** 解析 Excel (.xlsx) 清单为 RawRow[]（ExcelJS 读第一张 sheet） */
export async function parseExcelRows(buffer: Buffer): Promise<RawRow[]> {
  const ExcelJS = (await import('exceljs')).default as any;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell: any, col: any) => {
    // cellText 兼容富文本表头（如「SKU编号 *」是两段 richText 拼的），星号由 headerKey 清理
    headers[col - 1] = cellText(cell);
  });
  const rows: RawRow[] = [];
  ws.eachRow((row: any, rowNumber: any) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell: any, col: any) => {
      const h = headers[col - 1] || '';
      const v = cellText(cell);
      if (v.trim()) { raw[h.trim()] = v.trim(); hasData = true; }
    });
    if (hasData) rows.push(raw);
  });
  // 走 normalizeRow 做表头别名匹配
  return rows.map(normalizeRow);
}

export function parseProductList(text: string, format: 'csv' | 'json'): RawRow[] {
  if (format === 'json') {
    const j = JSON.parse(text);
    const arr: unknown[] = Array.isArray(j) ? j : Array.isArray((j as { products?: unknown[] }).products) ? (j as { products: unknown[] }).products : [];
    return arr.map(x => normalizeRow(Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]))));
  }
  return parseCsv(text).map(normalizeRow);
}

export type ImageSet = {
  /** 详情页图集 URL（主图在前） */
  images: string[];
  /** 主图（纯数字命名，如 1.jpg / 2.jpg） */
  main: string[];
  /** S 图（S+数字命名，如 S1.jpg / S2.jpg），当前仅随图集展示，不绑定尺码 */
  skuShots: string[];
  /** 按文件名字符串反查出的原始文件名，供后台编辑展示 */
  files: string[];
};

/** 文件名自然排序：1.jpg < 2.jpg < 10.jpg；前缀字母相同的按尾部数字排 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const ax = (a.toLowerCase().match(re) || []) as string[];
  const bx = (b.toLowerCase().match(re) || []) as string[];
  for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** S 图判定：S1.jpg / S2.jpg / s-3.jpg 这类「字母前缀 + 数字」 */
function isSkuShot(file: string): boolean {
  return /^s[-_]?\d/i.test(file);
}

/** 按自然排序拆分为「主图」与「S 图」，主图在前 */
export function sortImages(files: string[]): { main: string[]; skuShots: string[] } {
  const sorted = [...files].sort(naturalCompare);
  const main: string[] = [];
  const skuShots: string[] = [];
  for (const f of sorted) {
    if (isSkuShot(f)) skuShots.push(f);
    else main.push(f);
  }
  return { main, skuShots };
}

export type ValidateContext = {
  /** 已存在的分类 slug（来自 @kitvault/shared CATEGORIES） */
  categorySlugs: Set<string>;
  /**
   * 本地图片解析：传入配对键（编号优先，否则 SKU / image_folder），
   * 返回该子目录下的图片文件名。
   */
  localImages: (key: string) => string[];
  /** 本地图片对外路径前缀 */
  localUrlPrefix: string;
};

export function validateRow(r: RawRow, i: number, ctx: ValidateContext): ValidatedRow {
  const errors: string[] = [];
  const batchNo = (r.batch_no || '').trim();
  const sku = (r.sku || '').trim();
  const title = (r.title || '').trim();
  const price = Number(String(r.price_usd || '').replace(/[^0-9.]/g, ''));
  const compare = Number(String(r.compare_price_usd || '').replace(/[^0-9.]/g, ''));
  const sizes = (r.size_range || '').split(/[,/、\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const stock = Number(r.stock || '0') || 0;
  const category = (r.category || '').trim();
  const categories = category.split(/[,;、\s]+/).map(s => normCategory(s.trim())).filter(Boolean);
  const imageUrls = (r.image_urls || '').split(/[,;、\s]+/).map(s => s.trim()).filter(Boolean);
  const imageFolder = (r.image_folder || sku).trim();

  if (!sku) errors.push('sku 缺失');
  if (!title) errors.push('标题缺失');
  if (!(price > 0)) errors.push('价格无效（price_usd 需 > 0）');
  if (!sizes.length) errors.push('尺码缺失');
  else sizes.forEach(s => { if (!VALID_SIZES.includes(s)) errors.push(`尺码非法：${s}`); });
  categories.forEach(c => { if (!ctx.categorySlugs.has(c)) errors.push(`分类不存在：${c}（可用中文名或 slug，见模板「分类字典」）`); });
  const type = normType(r.type);
  const version = normVersion(r.version);
  if (r.type && !VALID_TYPES.includes(type)) errors.push(`类型非法：${r.type}（可填 主场/客场/第三球衣/门将/训练/复古 或 home/away/third/gk/training/retro）`);
  if (r.version && !VALID_VERSIONS.includes(version)) errors.push(`版本非法：${r.version}（可填 球迷版/球员版/儿童版 或 fan/player/kids）`);

  // 图片配对：编号（batch_no）优先，其次 image_folder / sku；都取不到才用 image_urls 外链
  const pairKey = batchNo || imageFolder;
  const local = ctx.localImages(pairKey);
  const { main, skuShots } = sortImages(local);
  const localUrls = [...main, ...skuShots].map(f => `${ctx.localUrlPrefix}/${encodeURIComponent(pairKey)}/${encodeURIComponent(f)}`);
  const images = localUrls.length ? localUrls : imageUrls;

  if (!images.length) {
    errors.push(batchNo
      ? `编号 ${batchNo} 没有配到图片（缺少 ${pairKey}/ 子目录，且 image_urls 为空）`
      : `无图片（缺少 ${pairKey}/ 子目录，且 image_urls 为空）`);
  }

  return {
    batchNo,
    sku, title,
    season: (r.season || '').trim(),
    team: (r.team || '').trim(),
    league: (r.league || '').trim(),
    type: type || 'home',
    version: version || 'fan',
    priceUsd: price,
    comparePriceUsd: compare > price ? compare : 0,
    sizes, stock,
    description: (r.description || '').trim(),
    category,
    categories,
    imageFolder,
    imageUrls,
    images,
    mainImages: localUrls.slice(0, main.length),
    skuShotImages: localUrls.slice(main.length),
    imageFiles: [...main, ...skuShots],
    handle: slugify(`${title}-${sku}`) || slugify(sku),
    errors,
  };
}

/** 行 → 前台商品结构（SlimProduct，字段含义见 packages/shared/src/data/products.ts） */
export function toSlimProduct(row: ValidatedRow, batchId: string) {
  const cl = [...new Set([...row.categories, row.season, row.team].filter(Boolean))];
  return {
    h: row.handle,
    t: row.title,
    p: row.priceUsd,
    c: row.comparePriceUsd,
    o: row.comparePriceUsd > 0 ? Math.round((1 - row.priceUsd / row.comparePriceUsd) * 100) : 0,
    s: row.sizes,
    i: row.images,
    v: row.mainImages[0] || row.images[0] || '',
    sa: 0,
    cl,
    d: row.description,
    // 尺码对应图预留位：当前导入不绑定（文件名改为 S/M/XL 形式时启用）
    si: {} as Record<string, string>,
    // 导入元数据（后台列表展示用，前台忽略）
    sku: row.sku,
    batchNo: row.batchNo,
    mainImages: row.mainImages,
    skuShotImages: row.skuShotImages,
    imageFiles: row.imageFiles,
    version: row.version,
    type: row.type,
    stock: row.stock,
    batchId,
    importedAt: new Date().toISOString(),
  };
}
