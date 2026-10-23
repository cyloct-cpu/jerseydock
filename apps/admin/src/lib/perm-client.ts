/**
 * 权限常量（纯数据，可在客户端组件中导入）
 * 判断逻辑在 lib/auth.ts（依赖 node:crypto，仅服务端）
 */

export type PermGroup = { group: string; items: { key: string; label: string; hint?: string }[] };

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    group: 'Overview',
    items: [{ key: 'dashboard.view', label: '数据看板', hint: '查看看板与各项统计' }],
  },
  {
    group: 'Catalog',
    items: [
      { key: 'products.view', label: '商品 · 查看', hint: '商品列表、筛选、搜索' },
      { key: 'products.edit', label: '商品 · 编辑', hint: '新增、改价、上下架、批量操作' },
      { key: 'products.delete', label: '商品 · 删除', hint: '批量归档删除' },
      { key: 'import.run', label: '批量导入 · 上传', hint: '上传清单与图片并导入' },
      { key: 'import.rollback', label: '批量导入 · 回滚', hint: '回滚已导入的批次' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { key: 'orders.view', label: '订单 · 查看', hint: '订单列表与详情（含客户邮箱地址）' },
      { key: 'orders.edit', label: '订单 · 编辑', hint: '标记支付状态' },
      { key: 'shipping.view', label: '物流 · 查看', hint: '轨迹与承运商信息' },
      { key: 'shipping.edit', label: '物流 · 编辑', hint: '发货、填写单号、添加轨迹' },
    ],
  },
  {
    group: 'CRM',
    items: [
      { key: 'customers.view', label: '客户 · 查看', hint: '客户档案与联系方式' },
      { key: 'customers.edit', label: '客户 · 编辑', hint: '修改客户信息、合并档案' },
      { key: 'followup.view', label: '回访 · 查看', hint: '回访看板' },
      { key: 'followup.edit', label: '回访 · 编辑', hint: '新增回访、更新进度' },
    ],
  },
  {
    group: 'System',
    items: [
      { key: 'settings.edit', label: '商店设置', hint: '品牌、公告条、支付文案' },
      { key: 'data.export', label: '数据导出', hint: '导出订单 / 客户 / 埋点 CSV' },
    ],
  },
];

/** 账号管理：仅 owner 拥有，不可授予 */
export const PERM_ADMINS_MANAGE = 'admins.manage';

export const ALL_PERMISSIONS: string[] = [
  ...PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key)),
  PERM_ADMINS_MANAGE,
];

/** 各模块的只读权限 */
export const PRESET_READONLY: string[] = PERMISSION_GROUPS.flatMap(g =>
  g.items.filter(i => i.key.endsWith('.view')).map(i => i.key)
);

/** 运营：商品 + 导入 + 订单物流读写，不含 CRM、设置、导出、账号 */
export const PRESET_OPERATOR: string[] = [
  'dashboard.view',
  'products.view', 'products.edit', 'products.delete',
  'import.run', 'import.rollback',
  'orders.view', 'orders.edit',
  'shipping.view', 'shipping.edit',
];

/** 客服：订单/物流/客户/回访只读 + 看板 */
export const PRESET_SUPPORT: string[] = [
  'dashboard.view',
  'orders.view', 'shipping.view',
  'customers.view', 'followup.view',
];

export type PermissionPreset = { key: string; label: string; hint: string; permissions: string[] };

export const PERMISSION_PRESETS: PermissionPreset[] = [
  { key: 'operator', label: '运营', hint: '商品 + 导入 + 订单物流', permissions: PRESET_OPERATOR },
  { key: 'support', label: '客服', hint: '订单物流客户回访（只读）', permissions: PRESET_SUPPORT },
  { key: 'readonly', label: '只读', hint: '所有模块仅查看', permissions: PRESET_READONLY },
  { key: 'all', label: '全部', hint: '除账号管理外的所有功能', permissions: ALL_PERMISSIONS.filter(p => p !== PERM_ADMINS_MANAGE) },
  { key: 'none', label: '清空', hint: '不授予任何权限', permissions: [] },
];

/** 页面路径 → 所需权限 */
export const PAGE_PERMISSIONS: Record<string, string> = {
  '/dashboard': 'dashboard.view',
  '/products': 'products.view',
  '/products/new': 'products.edit',
  '/products/import': 'import.run',
  '/media': 'products.edit',
  '/orders': 'orders.view',
  '/shipping': 'shipping.view',
  '/customers': 'customers.view',
  '/customers/followup': 'followup.view',
  '/settings': 'settings.edit',
  '/admins': PERM_ADMINS_MANAGE,
};

/** 权限 key → 中文名（摘要展示用） */
export const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap(g => g.items.map(i => [i.key, i.label]))
);

/** 账号类型（供客户端判断） */
export type PermUser = { role: 'owner' | 'operator' | 'viewer'; permissions: string[] };
