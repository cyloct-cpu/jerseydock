import { CATEGORIES } from '@kitvault/shared';

export type LinkOption = { value: string; label: string; group: string };

/** 站内固定页面 */
const STATIC_LINKS: LinkOption[] = [
  { value: '/', label: '首页', group: '常用页面' },
  { value: '/products', label: '全部商品', group: '常用页面' },
  { value: '/nations', label: '国家队总览', group: '常用页面' },
  { value: '/clubs', label: '俱乐部总览', group: '常用页面' },
];

/** 分类分组中文名（与 options.ts 保持一致，过滤掉抓取噪音组） */
const CATEGORY_GROUP_LABELS: Record<string, string> = {
  season: '赛季',
  retro: '复古',
  nation: '国家队',
  club: '俱乐部',
  kids: '儿童',
  outerwear: '秋冬外套',
  shorts: '短裤',
};

const GROUP_ORDER = ['常用页面', '赛季', '复古', '国家队', '俱乐部', '儿童', '秋冬外套', '短裤'];

/** Hero 主/次链接可选的站内页面（下拉选择用；自定义链接仍可直接输入） */
export const LINK_OPTIONS: LinkOption[] = [
  ...STATIC_LINKS,
  ...CATEGORIES.filter(c => CATEGORY_GROUP_LABELS[c.group]).map(c => ({
    value: `/collections/${c.slug}`,
    label: c.label,
    group: CATEGORY_GROUP_LABELS[c.group],
  })),
];

/** 按分组聚合（渲染 optgroup 用） */
export const LINK_OPTION_GROUPS: { group: string; items: LinkOption[] }[] = GROUP_ORDER.map(group => ({
  group,
  items: LINK_OPTIONS.filter(o => o.group === group),
})).filter(g => g.items.length);
