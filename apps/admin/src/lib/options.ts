import { CATEGORIES, CATEGORY_CN } from '@kitvault/shared';
import type { MsOption } from '@/components/MultiSelect';

/** 尺码下拉选项（与 import-parse.ts 的 VALID_SIZES 保持一致） */
export const SIZE_GROUPS: [string, string[]][] = [
  ['成人尺码', ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'XXL', 'XXXL']],
  ['儿童尺码', ['YS', 'YM', 'YL', 'YXL', '16', '18', '20', '22', '24', '26', '28']],
];

export const SIZE_OPTIONS: MsOption[] = SIZE_GROUPS.flatMap(([group, list]) =>
  list.map(value => ({ value, label: value, group })),
);

/** 分类下拉选项：只保留真实产品分组（赛季/复古/国家队/俱乐部/儿童/秋冬外套/短裤） */
const CATEGORY_GROUP_LABELS: Record<string, string> = {
  season: '赛季',
  retro: '复古',
  nation: '国家队',
  club: '俱乐部',
  kids: '儿童',
  outerwear: '秋冬外套',
  shorts: '短裤',
};

const GROUP_ORDER = ['赛季', '复古', '国家队', '俱乐部', '儿童', '秋冬外套', '短裤'];

export const CATEGORY_OPTIONS: MsOption[] = CATEGORIES
  .filter(c => CATEGORY_GROUP_LABELS[c.group])
  .map(c => ({ value: c.slug, label: CATEGORY_CN[c.slug] || c.label, group: CATEGORY_GROUP_LABELS[c.group] }))
  .sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group!), gb = GROUP_ORDER.indexOf(b.group!);
    return ga !== gb ? ga - gb : a.label.localeCompare(b.label);
  });
