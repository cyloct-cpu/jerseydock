import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { CATEGORIES, CATEGORY_CN } from '@kitvault/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 导入模板下载
 *   ?format=xlsx（默认）— 多工作表：填写模板 + 字段说明 + 分类字典 + 合法值
 *   ?format=csv           — 纯 CSV，带 UTF-8 BOM，Excel 双击不乱码
 *   ?format=json          — JSON 格式
 *
 * 模板里的分类取值全部来自真实 CATEGORIES，下载即可通过校验。
 */

/** 表头文字 = 中文名；必填项附加红色 * （解析器已能清洗星号，见 lib/import-parse.ts normalizeHeader） */
const COLUMNS = [
  { key: 'batch_no', cn: '编号', width: 10, required: false, note: '选填。图片子目录名（如 1 / 2 / A01），用于自动配对该行的图片。留空则按 SKU 匹配。' },
  { key: 'sku', cn: 'SKU编号', width: 24, required: true, note: '必填。文本，全表唯一' },
  { key: 'title', cn: '标题', width: 46, required: true, note: '必填。文本，前台商品标题与详情页标题' },
  { key: 'season', cn: '赛季', width: 18, required: false, note: '下拉可选。留空则不写入，用于前台归类与筛选' },
  { key: 'team', cn: '球队', width: 20, required: false, note: '下拉可选（俱乐部 / 国家队）。留空则不写入' },
  { key: 'league', cn: '联赛', width: 20, required: false, note: '下拉可选。留空则不写入' },
  { key: 'type', cn: '类型', width: 14, required: false, note: '下拉可选，中英文均可：主场(home)/客场(away)/第三球衣(third)/门将(gk)/训练(training)/复古(retro)，留空默认 home' },
  { key: 'version', cn: '版本', width: 14, required: false, note: '下拉可选，中英文均可：球迷版(fan)/球员版(player)/儿童版(kids)，留空默认 fan' },
  { key: 'price_usd', cn: '价格', width: 12, required: true, note: '必填。数字 > 0，单位 USD，其他货币按汇率换算' },
  { key: 'compare_price_usd', cn: '原价', width: 12, required: false, note: '选填。数字且需大于售价，否则视为无划线价' },
  { key: 'size_range', cn: '尺码', width: 28, required: true, note: '必填。下拉选常用组合，也可手填。单码合法值：XS S M L XL 2XL 3XL 4XL 5XL XXL XXXL YS YM YL YXL 16-28' },
  { key: 'stock', cn: '库存', width: 10, required: false, note: '选填。整数 ≥ 0，留空按 0 处理' },
  { key: 'description', cn: '描述', width: 50, required: false, note: '选填。文本，前台商品详情文案' },
  { key: 'category', cn: '分类', width: 24, required: false, note: '下拉可选 slug；也可直接填中文名（如 阿森纳/巴塞罗那/复古，见「分类字典」中文名列）。留空则不归类' },
  { key: 'image_folder', cn: '图片目录', width: 22, required: false, note: '选填。编号列留空时用它匹配图片子目录；缺省等于 SKU' },
  { key: 'image_urls', cn: '图片链接', width: 40, required: false, note: '选填。多张用逗号分隔的完整 URL。与上传图片至少要有一项' },
] as const;

const VALID_SIZES = 'XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, XXL, XXXL, YS, YM, YL, YXL, 16, 18, 20, 22, 24, 26, 28';
const VALID_TYPES = '主场(home), 客场(away), 第三球衣(third), 门将(gk), 训练(training), 复古(retro)';
const VALID_VERSIONS = '球迷版(fan), 球员版(player), 儿童版(kids)';

/**
 * 常用尺码组合。
 * 注意：Excel 内联下拉以英文逗号分隔选项，所以选项本身不能含逗号；
 * 这里用空格分隔（import-parse 的 size_range 正则 [,/、\s]+ 同样支持空格）。
 */
const SIZE_PRESETS = [
  'XS S M L XL',
  'S M L XL',
  'M L XL',
  'L XL',
  'XS S M L XL 2XL',
  'S M L XL 2XL',
  'S M L XL 2XL 3XL',
  'S M L XL 2XL 3XL 4XL',
  'XS S M L XL 2XL 3XL 4XL',
  'YS YM YL',
  'YS YM YL YXL',
  'YS YM YL YXL 3XL',
  'XXL',
  'XXXL',
  'XXL XXXL',
  '16 18 20 22 24 26 28',
];

/** 联赛下拉（内置常见联赛，避免管理员自行拼写不一致） */
const LEAGUES = [
  'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'Eredivisie', 'Primeira Liga', 'Champions League', 'Europa League',
  'National', 'Various',
];

/** 从分类数据中按分组提取 slug */
function slugsOfGroup(...groups: string[]): string[] {
  const set = new Set(groups);
  return CATEGORIES.filter(c => set.has(c.group)).map(c => c.slug);
}

const SEASON_OPTIONS = slugsOfGroup('season');
const CLUB_OPTIONS = slugsOfGroup('club');
const NATION_OPTIONS = slugsOfGroup('nation');
const TEAM_OPTIONS = [...CLUB_OPTIONS, ...NATION_OPTIONS];

/** 按球队名模糊匹配站内分类 slug；匹配不到返回 ''（留空是合法值，表示不归类） */

const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1F' } };
const HEAD_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFC8A24A' }, bold: true, size: 11 };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF2A2A30' } },
  left: { style: 'thin', color: { argb: 'FF2A2A30' } },
  bottom: { style: 'thin', color: { argb: 'FF2A2A30' } },
  right: { style: 'thin', color: { argb: 'FF2A2A30' } },
};

/** 按球队名模糊匹配站内分类 slug；匹配不到返回 ''（留空是合法值，表示不归类） */
function categoryFor(team: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = CATEGORIES.find(c => norm(c.slug).includes(norm(team).slice(0, 4)) && norm(team).length >= 3);
  return hit ? hit.slug : '';
}

/** 示例数据：编号与图片子目录对应，分类取自真实 CATEGORIES，下载即可通过校验 */
function sampleRows(): Record<string, string>[] {
  return [
    {
      batch_no: '1',
      sku: 'KV-2026-27-ARS-HOME',
      title: '2026-27 Arsenal Home Jersey – Fan Version',
      season: '2026-27', team: 'Arsenal', league: 'Premier League',
      type: 'home', version: 'fan',
      price_usd: '68.00', compare_price_usd: '99.00',
      size_range: 'S M L XL 2XL', stock: '50',
      description: '2026-27 home shirt in cannon red. Breathable fan version with woven crest.',
      category: categoryFor('Arsenal'), image_folder: '', image_urls: '',
    },
    {
      batch_no: '2',
      sku: 'KV-2026-27-BAR-AWAY-KIDS',
      title: '2026-27 Barcelona Away Shirt – Kids',
      season: '2026-27', team: 'Barcelona', league: 'La Liga',
      type: 'away', version: 'kids',
      price_usd: '42.00', compare_price_usd: '',
      size_range: 'YS YM YL', stock: '30',
      description: 'Kids version of the 2026-27 away shirt. Soft cotton, ribbed collar.',
      category: categoryFor('Barcelona'), image_folder: '', image_urls: '',
    },
    {
      batch_no: '3',
      sku: 'KV-2025-26-RETRO-3PACK',
      title: 'Retro National Team Shirt 3-Pack',
      season: '2025-26', team: 'Various', league: 'National',
      type: 'retro', version: 'fan',
      price_usd: '55.00', compare_price_usd: '75.00',
      size_range: 'M L XL', stock: '20',
      description: 'Classic retro national team shirts. Machine wash cold, do not tumble dry.',
      category: 'retro', image_folder: '', image_urls: '',
    },
    {
      // 演示「编号列留空 → 按 SKU 匹配」的老方式，两种写法都支持
      batch_no: '',
      sku: 'KV-2026-27-LOCAL-IMG',
      title: 'Example row matched by SKU (编号 left blank)',
      season: '2026-27-season', team: 'Sample FC', league: 'Premier League',
      type: 'third', version: 'player',
      price_usd: '89.00', compare_price_usd: '',
      size_range: 'L XL', stock: '10',
      description: '编号留空时，系统改用 SKU 匹配图片子目录：建一个 KV-2026-27-LOCAL-IMG/ 文件夹即可。',
      category: '', image_folder: 'KV-2026-27-LOCAL-IMG', image_urls: '',
    },
  ];
}

async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JERSEYDOCK Admin';
  wb.created = new Date();

  // ---------- Sheet 1：填写模板 ----------
  const ws = wb.addWorksheet('填写模板', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = COLUMNS.map(c => ({ header: c.cn, key: c.key, width: c.width }));
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell, col) => {
    const def = COLUMNS[col - 1];
    // 必填项表头显示红色星号（解析器 normalizeHeader 会清洗星号）
    if (def?.required) {
      cell.value = {
        richText: [
          { text: def.cn, font: HEAD_FONT },
          { text: ' *', font: { color: { argb: 'FFE5484D' }, bold: true, size: 13 } },
        ],
      };
    }
    cell.fill = HEAD_FILL;
    cell.font = HEAD_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER;
  });
  // 表头批注：说明必填/选填与取值
  COLUMNS.forEach((c, i) => {
    ws.getRow(1).getCell(i + 1).note = c.required ? `【必填】${c.note}` : `【选填】${c.note}`;
  });

  const rows = sampleRows();
  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
      // 示例行淡黄底，提示可覆盖
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F1E0' } };
      if (['price_usd', 'compare_price_usd', 'stock'].includes(COLUMNS[col - 1].key)) {
        cell.numFmt = '0.00';
        cell.alignment = { vertical: 'top', horizontal: 'right' };
      }
      if (COLUMNS[col - 1].key === 'size_range' && i === 3) {
        cell.alignment = { vertical: 'top', wrapText: true };
      }
    });
  });

  // 预留 200 行空行方便继续录入，并挂上数据校验下拉
  for (let i = 0; i < 200; i++) {
    const row = ws.addRow({});
    row.height = 18;
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
      const key = COLUMNS[col - 1]?.key;
      if (key && ['price_usd', 'compare_price_usd', 'stock'].includes(key)) cell.numFmt = '0.00';
    });
  }

  const lastRow = ws.rowCount;
  const inList = (values: string[], title: string, hint: string): ExcelJS.DataValidation => ({
    type: 'list', allowBlank: true,
    // Excel 内联列表以英文逗号分隔选项，因此选项本身不能含逗号
    formulae: [values.length ? `"${values.join(',')}"` : '""'],
    showErrorMessage: true, errorStyle: 'warning',
    errorTitle: title, error: hint,
  });
  /** 按列 key 批量挂下拉（覆盖全部数据行） */
  const applyList = (key: string, values: string[], title: string, hint: string) => {
    const idx = COLUMNS.findIndex(c => c.key === key);
    if (idx < 0 || !values.length) return;
    for (let r = 2; r <= lastRow; r++) {
      ws.getRow(r).getCell(idx + 1).dataValidation = inList(values, title, hint);
    }
  };

  // 可下拉选择的字段（管理员无需手填，取值全部来自站内真实数据）
  applyList('season', SEASON_OPTIONS, '赛季不在下拉列表中',
    `可选赛季：${SEASON_OPTIONS.join('、')}。也可直接手填，或留空不写入。`);
  applyList('team', TEAM_OPTIONS, '球队不在下拉列表中',
    `可选球队共 ${TEAM_OPTIONS.length} 项（俱乐部 ${CLUB_OPTIONS.length} + 国家队 ${NATION_OPTIONS.length}），详见「分类字典」表。也可手填或留空。`);
  applyList('league', LEAGUES, '联赛不在下拉列表中',
    `可选：${LEAGUES.join('、')}。也可手填或留空。`);
  applyList('type', VALID_TYPES.split(', '), '类型取值非法',
    '中英文均可（中文如 主场/客场，英文如 home/away），留空默认 home；推荐从下拉选择');
  applyList('version', VALID_VERSIONS.split(', '), '版本取值非法',
    '中英文均可（中文如 球迷版/球员版/儿童版，英文如 fan/player/kids），留空默认 fan；推荐从下拉选择');
  applyList('size_range', SIZE_PRESETS, '尺码格式需为单码',
    `可直接选常用组合（${SIZE_PRESETS.length} 种），或手填。单码合法值：${VALID_SIZES}。多个尺码用空格、逗号或斜杠分隔均可。`);

  // price_usd / stock 数值校验（按列序号取，避免表头 richText 覆盖 key）
  const priceIdx = COLUMNS.findIndex(c => c.key === 'price_usd');
  const stockIdx = COLUMNS.findIndex(c => c.key === 'stock');
  for (let r = 2; r <= lastRow; r++) {
    ws.getRow(r).getCell(priceIdx + 1).dataValidation = {
      type: 'decimal', operator: 'greaterThan', allowBlank: true, formulae: [0],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: '价格无效', error: '【必填】售价必须是大于 0 的数字（USD）',
    };
    ws.getRow(r).getCell(stockIdx + 1).dataValidation = {
      type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
      showErrorMessage: true, errorStyle: 'warning',
      errorTitle: '库存无效', error: '库存需为 ≥ 0 的整数',
    };
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  // ---------- Sheet 2：字段说明 ----------
  const doc = wb.addWorksheet('字段说明');
  doc.columns = [
    { header: '列名（中文）', key: 'cn', width: 16 },
    { header: '列名（英文）', key: 'en', width: 24 },
    { header: '必填', key: 'req', width: 10 },
    { header: '填写方式', key: 'how', width: 18 },
    { header: '格式与取值', key: 'format', width: 46 },
    { header: '说明', key: 'note', width: 54 },
  ];
  const docHead = doc.getRow(1);
  docHead.height = 26;
  docHead.eachCell(cell => {
    cell.fill = HEAD_FILL;
    cell.font = HEAD_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER;
  });
  for (const c of COLUMNS) {
    const r = doc.addRow({
      cn: c.required ? `${c.cn} *` : c.cn,
      en: c.key,
      req: c.required ? '必填' : '选填',
      how: HOW[c.key] || '手填',
      format: FORMAT[c.key] || '',
      note: c.note,
    });
    r.eachCell(cell => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    if (c.required) {
      r.getCell('req').font = { color: { argb: 'FFE5484D' }, bold: true };
      r.getCell('cn').font = { color: { argb: 'FFE5484D' }, bold: true };
    }
  }
  doc.addRow({});
  const notes = doc.addRow({ cn: '合法取值速查', en: '', req: '', how: '', format: '', note: '' });
  notes.getCell('cn').font = { bold: true, size: 12, color: { argb: 'FFC8A24A' } };
  for (const [k, v] of [
    ['尺码 size_range', `${VALID_SIZES}（下拉提供 ${SIZE_PRESETS.length} 个常用组合）`],
    ['类型 type', VALID_TYPES],
    ['版本 version', VALID_VERSIONS],
    ['赛季 season', `下拉 ${SEASON_OPTIONS.length} 项：${SEASON_OPTIONS.join('、')}`],
    ['球队 team', `下拉 ${TEAM_OPTIONS.length} 项（俱乐部 ${CLUB_OPTIONS.length} + 国家队 ${NATION_OPTIONS.length}），详见「分类字典」`],
    ['联赛 league', LEAGUES.join(' / ')],
    ['分类 category', `下拉 ${CATEGORIES.length} 项，详见「分类字典」`],
    ['表头语言', '中文（带 *）与英文原名都能识别，星号不影响解析'],
    ['图片配对', '清单「编号」列 = 图片文件夹里的子目录名，系统自动配对，无需手动填图片'],
    ['图片目录结构', '批次目录/  ├─ 1/  ├─ 1.jpg 2.jpg 3.jpg（主图，按数字排序）  └─ S1.jpg S2.jpg（S 图，排后面）\n         ├─ 2/  └─ …其余编号同理…'],
    ['批次隔离', '每批上传的图片落在各自批次目录下，因此不同批次可以用相同的编号（如都是 1/2/3）'],
    ['编号留空', '编号列为空时，系统改用 SKU（或「图片目录」列）匹配图片子目录，向后兼容老方式'],
    ['图片方式', '上传本地图片（在 image_urls 填外链也可，两者至少要有一）'],
    ['导入后状态', '默认草稿，需到「商品管理」勾选上架'],
  ]) {
    const r = doc.addRow({ cn: '', en: '', req: '', how: '', format: k, note: v });
    r.getCell('format').font = { bold: true };
    r.getCell('note').alignment = { wrapText: true, vertical: 'top' };
    r.eachCell(cell => { cell.border = BORDER; });
  }

  // ---------- Sheet 3：分类字典 ----------
  const dict = wb.addWorksheet('分类字典');
  dict.columns = [
    { header: '分类 slug（填入 分类 列）', key: 'slug', width: 36 },
    { header: '中文名（分类 列也可直接填这个）', key: 'cn', width: 18 },
    { header: '显示名称', key: 'label', width: 32 },
    { header: '分组（season / club / nation 的可填入 赛季 / 球队 列）', key: 'group', width: 52 },
    { header: '商品数', key: 'count', width: 10 },
  ];
  const dictHead = dict.getRow(1);
  dictHead.height = 24;
  dictHead.eachCell(cell => {
    cell.fill = HEAD_FILL;
    cell.font = HEAD_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER;
  });
  for (const c of CATEGORIES) {
    const r = dict.addRow({ slug: c.slug, cn: CATEGORY_CN[c.slug] || '', label: c.label, group: c.group, count: c.count });
    r.eachCell(cell => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top' };
    });
  }
  dict.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  // 分类列下拉：138 项全部来自站内真实分类
  applyList('category', CATEGORIES.map(c => c.slug), '分类不存在',
    `请从下拉列表中选择 slug（共 ${CATEGORIES.length} 项），中文名见「分类字典」表——分类列也可直接填中文名（如 阿森纳）。留空表示不归类。`);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** 各字段的填写方式（字段说明页用） */
const HOW: Record<string, string> = {
  season: '下拉选择',
  team: '下拉选择',
  league: '下拉选择',
  type: '下拉选择',
  version: '下拉选择',
  size_range: '下拉选择',
  category: '下拉选择',
};

/** 各字段的格式说明（字段说明页用） */
const FORMAT: Record<string, string> = {
  sku: '文本，全表唯一',
  title: '文本',
  season: SEASON_OPTIONS.join(' / '),
  team: `${TEAM_OPTIONS.length} 项（俱乐部 ${CLUB_OPTIONS.length} + 国家队 ${NATION_OPTIONS.length}）`,
  league: LEAGUES.join(' / '),
  type: VALID_TYPES + '（中英文均可）',
  version: VALID_VERSIONS + '（中英文均可）',
  price_usd: '数字 > 0，单位 USD',
  compare_price_usd: '数字，需大于售价，否则视为无划线价',
  size_range: VALID_SIZES,
  stock: '整数 ≥ 0',
  description: '文本',
  category: `分类列填 slug 或中文名（如 阿森纳），见「分类字典」中文名列`,
  image_folder: '文本，默认等于 SKU',
  image_urls: '多个完整 URL 用逗号分隔',
};

function esc(v: string): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase();

  if (format === 'csv') {
    // 表头带 * 标注必填（解析器 normalizeHeader 会清洗，不影响导入）
    const header = COLUMNS.map(c => `${c.cn}${c.required ? ' *' : ''}`).join(',');
    const body = sampleRows().map(r => COLUMNS.map(c => esc(r[c.key] ?? '')).join(',')).join('\r\n');
    return new NextResponse(`\uFEFF${header}\r\n${body}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products-template.csv"',
      },
    });
  }

  if (format === 'json') {
    const payload = sampleRows().map(r => Object.fromEntries(COLUMNS.map(c => [c.key, r[c.key] ?? ''])));
    return new NextResponse(JSON.stringify({ products: payload }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products-template.json"',
      },
    });
  }

  const buf = await buildXlsx();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products-template.xlsx"',
      'Content-Length': String(buf.length),
    },
  });
}
