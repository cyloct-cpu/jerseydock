/**
 * 分类中文名（slug → 中文）
 * 用途：
 *   1. 后台分类选择器 / 批量导入模板「分类字典」显示中文名
 *   2. 批量导入「分类」列可直接填中文名，解析时反查为 slug
 * 未收录的 slug 回退显示英文 label（新增分类时按需补充本表）。
 */
export const CATEGORY_CN: Record<string, string> = {
  // ---- 赛季 ----
  '2026-27-season': '2026-27赛季',
  '2025-26-season': '2025-26赛季',
  '2024-25-season': '2024-25赛季',
  // ---- 复古 / 儿童 / 外套 / 短裤 ----
  retro: '复古',
  'kids-size': '儿童尺码',
  'autumn-and-winter-series': '秋冬系列',
  'trench-coat': '风衣外套',
  'shorts-f9eg': '短裤',
  // ---- 俱乐部 ----
  'manchester-united': '曼联',
  arsenal: '阿森纳',
  liverpool: '利物浦',
  paris: '巴黎圣日耳曼',
  'ac-milan': 'AC米兰',
  'real-madrid': '皇家马德里',
  bayern: '拜仁慕尼黑',
  'inter-milan': '国际米兰',
  chelsea: '切尔西',
  barcelona: '巴塞罗那',
  juventus: '尤文图斯',
  'manchester-city': '曼城',
  tottenham: '热刺',
  'atletico-madrid': '马德里竞技',
  marseille: '马赛',
  'real-betis': '皇家贝蒂斯',
  dortmund: '多特蒙德',
  ajax: '阿贾克斯',
  celtic: '凯尔特人',
  benfica: '本菲卡',
  santos: '桑托斯',
  'boca-juniors': '博卡青年',
  'aston-villa': '阿斯顿维拉',
  'sao-paulo': '圣保罗',
  lyon: '里昂',
  lazio: '拉齐奥',
  palmeiras: '帕尔梅拉斯',
  chivas: '芝华士',
  fluminense: '弗鲁米嫩塞',
  'river-plate': '河床',
  'athletic-bilbao': '毕尔巴鄂竞技',
  brighton: '布莱顿',
  rangers: '流浪者',
  'crystal-palace': '水晶宫',
  'la-galaxy': '洛杉矶银河',
  feyenoord: '费耶诺德',
  corinthians: '科林蒂安',
  forest: '诺丁汉森林',
  // ---- 国家队 ----
  brazil: '巴西',
  spain: '西班牙',
  portugal: '葡萄牙',
  argentina: '阿根廷',
  germany: '德国',
  england: '英格兰',
  france: '法国',
  mexico: '墨西哥',
  italy: '意大利',
  netherlands: '荷兰',
  japan: '日本',
  croatia: '克罗地亚',
  ireland: '爱尔兰',
  jamaica: '牙买加',
  cameroon: '喀麦隆',
  belgium: '比利时',
  senegal: '塞内加尔',
  norway: '挪威',
  uruguay: '乌拉圭',
  nigeria: '尼日利亚',
  sweden: '瑞典',
  algeria: '阿尔及利亚',
  morocco: '摩洛哥',
  'ivory-coast': '科特迪瓦',
  canada: '加拿大',
  wales: '威尔士',
  switzerland: '瑞士',
  egypt: '埃及',
  ghana: '加纳',
  qatar: '卡塔尔',
  australia: '澳大利亚',
  poland: '波兰',
  denmark: '丹麦',
  iraq: '伊拉克',
  iran: '伊朗',
  finland: '芬兰',
  paraguay: '巴拉圭',
  chile: '智利',
  guatemala: '危地马拉',
  tunisia: '突尼斯',
  'south-korea': '韩国',
  // ---- 其他 / 联赛 / 品类 ----
  'newcastle-united': '纽卡斯尔联',
  flamenco: '弗拉门戈',
  naples: '那不勒斯',
  rome: '罗马',
  miami: '迈阿密国际',
  florentine: '佛罗伦萨',
  'west-ham-united': '西汉姆联',
  cougar: '美洲狮',
  'leeds-united': '利兹联',
  america: '美洲',
  tigers: '老虎队',
  nottingham: '诺丁汉',
  leipzig: '莱比锡',
  wanderers: '流浪者',
  leverkusen: '勒沃库森',
  seville: '塞维利亚',
  jordan: '乔丹',
  'saudi-arabian': '沙特阿拉伯',
  'riyadh-victory': '利雅得胜利',
  'riyadh-crescent': '利雅得新月',
  'jeddah-united': '吉达联合',
  jeddahnationals: '吉达国民',
  'serie-a': '意甲',
  'premier-league': '英超',
  'la-liga': '西甲',
  'ligue-1': '法甲',
  bundesliga: '德甲',
  'brazilian-club': '巴西俱乐部',
  'palm-trees': '棕榈树',
  cruise: '巡游者',
  home: '主场',
  'national-team': '国家队',
  'club-team': '俱乐部球队',
  'more-links': '更多链接',
  'more-links-5clo': '更多链接5clo',
  europe: '欧洲',
  international: '国际',
  'other-teams': '其他球队',
  africa: '非洲',
  asia: '亚洲',
  league: '联赛',
  harbor: '港口',
  'returns-refund-policy': '退货退款政策',
  'privacy-statement': '隐私政策',
  'terms-of-service': '服务条款',
};

/** 中文名 → slug 反查表（懒构建） */
let reverse: Map<string, string> | null = null;

export function categoryCn(slug: string): string {
  return CATEGORY_CN[slug] || '';
}

/** 中文名 / 英文名 / slug → slug；识别不到返回空串 */
export function resolveCategorySlug(value: string, categories: { slug: string; label: string }[]): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (categories.some(c => c.slug === v)) return v;
  const lower = v.toLowerCase();
  const byLabel = categories.find(c => c.label.toLowerCase() === lower);
  if (byLabel) return byLabel.slug;
  reverse = reverse || new Map(Object.entries(CATEGORY_CN).map(([slug, cn]) => [cn, slug]));
  return reverse.get(v) || '';
}
