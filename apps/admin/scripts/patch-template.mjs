const fs = require('fs');
const f = 'src/app/api/template/route.ts';
const src = fs.readFileSync(f, 'utf8');
const start = src.indexOf('async function buildXlsx');
const end = src.indexOf('function esc(v: string)');
if (start < 0 || end < 0) { console.error('anchors not found'); process.exit(1); }

const NEW = `async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KITVAULT Admin';
  wb.created = new Date();

  // ---------- Sheet 1：填写模板 ----------
  const ws = wb.addWorksheet('填写模板', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = COLUMNS.map(c => ({ header: c.cn, key: c.key, width: c.width }));

  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell, col) => {
    const def = COLUMNS[col - 1];
    // 必填项：表头显示红色星号（解析器已支持清洗星号）
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
  COLUMNS.forEach((c, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.note = c.required
      ? \`【必填】\${c.note}\`
      : \`【选填】\${c.note}\`;
  });

  // 示例行（淡黄底，可直接覆盖）
  sampleRows().forEach(r => {
    const row = ws.addRow(r);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F1E0' } };
      const key = COLUMNS[col - 1]?.key;
      if (key && NUMERIC_KEYS.has(key)) {
        cell.numFmt = '0.00';
        cell.alignment = { vertical: 'top', horizontal: 'right' };
      }
    });
  });

  // 预留 200 行录入区
  for (let i = 0; i < 200; i++) {
    const row = ws.addRow({});
    row.height = 18;
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: true };
      const key = COLUMNS[col - 1]?.key;
      if (key && NUMERIC_KEYS.has(key)) cell.numFmt = '0.00';
    });
  }

  // ---------- 数据校验（下拉 / 数值） ----------
  const FIRST_DATA_ROW = 2;
  const LAST_DATA_ROW = ws.rowCount;

  const listDv = (values: string[], title: string, hint: string): ExcelJS.DataValidation => ({
    type: 'list',
    allowBlank: true,
    formulae: [values.length ? \`"\${values.join(',')}"\` : '""'],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: title,
    error: hint,
  });

  /** 按列序号批量挂下拉 */
  const applyList = (key: string, values: string[], title: string, hint: string) => {
    const idx = COLUMNS.findIndex(c => c.key === key);
    if (idx < 0 || !values.length) return;
    for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
      ws.getRow(r).getCell(idx + 1).dataValidation = listDv(values, title, hint);
    }
  };

  // 赛季 / 球队 / 联赛 / 类型 / 版本 / 尺码组合：内联下拉
  applyList('season', SEASON_OPTIONS, '赛季不在列表中',
    \`可选赛季：\${SEASON_OPTIONS.join('、')}。若不在列表中可直接手填，或留空。\`);
  applyList('team', TEAM_OPTIONS, '球队不在列表中',
    \`可选球队（俱乐部 \${CLUB_OPTIONS.length} + 国家队 \${NATION_OPTIONS.length}）来自站内分类。可直接手填或留空。\`);
  applyList('league', LEAGUES, '联赛不在列表中',
    \`可选：\${LEAGUES.join('、')}。可直接手填或留空。\`);
  applyList('type', VALID_TYPES.split(','), '类型取值非法',
    '合法值：home / away / third / gk / training / retro，留空默认 home');
  applyList('version', VALID_VERSIONS.split(','), '版本取值非法',
    '合法值：fan / player / kids，留空默认 fan');
  applyList('size_range', SIZE_PRESETS, '尺码格式不对',
    \`可直接选择常用组合，或手填。合法单码：\${VALID_SIZES.replace(/, /g, ' ')}（用逗号分隔）\`);

  // 价格 / 库存：数值校验
  const priceIdx = COLUMNS.findIndex(c => c.key === 'price_usd');
  const stockIdx = COLUMNS.findIndex(c => c.key === 'stock');
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
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
      cn: c.required ? \`\${c.cn} *\` : c.cn,
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
  const notesTitle = doc.addRow({ cn: '合法取值速查', en: '', req: '', how: '', format: '', note: '' });
  notesTitle.getCell('cn').font = { bold: true, size: 12, color: { argb: 'FFC8A24A' } };
  for (const [k, v] of [
    ['尺码 size_range', \`\${VALID_SIZES}（本列下拉提供 \${SIZE_PRESETS.length} 个常用组合）\`],
    ['类型 type', VALID_TYPES],
    ['版本 version', VALID_VERSIONS],
    ['赛季 season', \`下拉 \${SEASON_OPTIONS.length} 项：\${SEASON_OPTIONS.join('、')}\`],
    ['球队 team', \`下拉 \${TEAM_OPTIONS.length} 项（俱乐部 \${CLUB_OPTIONS.length} + 国家队 \${NATION_OPTIONS.length}），详见「分类字典」\`],
    ['联赛 league', LEAGUES.join(' / ')],
    ['分类 category', \`下拉 \${CATEGORIES.length} 项，详见「分类字典」\`],
    ['表头语言', '中文带 * 与英文原名都能识别；星号不影响解析'],
    ['图片方式', '上传本地图片（文件名 = SKU）或在 image_urls 填外链，两者至少要有一'],
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
    { header: '显示名称', key: 'label', width: 32 },
    { header: '分组（分组=season/club/nation 的可填入 赛季/球队 列）', key: 'group', width: 52 },
    { header: '商品数', key: 'count', width: 10 },
  ];
  const dictHead = dict.getRow(1);
  dictHead.height = 26;
  dictHead.eachCell(cell => {
    cell.fill = HEAD_FILL;
    cell.font = HEAD_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  });
  for (const c of CATEGORIES) {
    const r = dict.addRow({ slug: c.slug, label: c.label, group: c.group, count: c.count });
    r.eachCell(cell => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'top' };
    });
  }
  dict.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };

  // 分类列下拉跨表引用「分类字典」；过长时退化为内联
  const catIdx = COLUMNS.findIndex(c => c.key === 'category');
  const slugList = CATEGORIES.map(c => c.slug);
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r++) {
    ws.getRow(r).getCell(catIdx + 1).dataValidation = listDv(
      slugList, '分类不存在', \`请从下拉列表中选择（共 \${slugList.length} 项），或到「分类字典」表复制 slug。留空表示不归类。\`
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

const NUMERIC_KEYS = new Set(['price_usd', 'compare_price_usd', 'stock']);

/** 每个字段的填写方式（字段说明页用） */
const HOW: Record<string, string> = {
  season: '下拉选择',
  team: '下拉选择',
  league: '下拉选择',
  type: '下拉选择',
  version: '下拉选择',
  size_range: '下拉选择',
  category: '下拉选择',
};

/** 每个字段的格式说明（字段说明页用） */
const FORMAT: Record<string, string> = {
  sku: '文本，全表唯一',
  title: '文本',
  season: SEASON_OPTIONS.join(' / '),
  team: \`\${TEAM_OPTIONS.length} 项（俱乐部 \${CLUB_OPTIONS.length} + 国家队 \${NATION_OPTIONS.length}）\`,
  league: LEAGUES.join(' / '),
  type: VALID_TYPES,
  version: VALID_VERSIONS,
  price_usd: '数字 > 0，单位 USD',
  compare_price_usd: '数字，需大于售价，否则视为无划线价',
  size_range: VALID_SIZES,
  stock: '整数 ≥ 0',
  description: '文本',
  category: \`\${CATEGORIES.length} 项分类 slug，见「分类字典」\`,
  image_folder: '文本，默认等于 SKU',
  image_urls: '多个完整 URL 用逗号分隔',
};

`;

fs.writeFileSync(f, src.slice(0, start) + NEW + src.slice(end), 'utf8');
console.log('buildXlsx replaced, new length:', (src.slice(0,start)+NEW+src.slice(end)).length);
