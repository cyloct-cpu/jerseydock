'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PAGE_PERMISSIONS } from '@/lib/perm-client';

const GROUPS: { label: string; items: { href: string; label: string; badge?: string }[] }[] = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: '数据看板' }],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/products', label: '商品管理' },
      { href: '/products/new', label: '新增商品' },
      { href: '/products/import', label: '批量导入' },
      { href: '/media', label: '图库管理' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/orders', label: '订单管理' },
      { href: '/shipping', label: '物流管理' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { href: '/customers', label: '客户管理' },
      { href: '/customers/followup', label: '回访看板' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: '商店设置' },
      { href: '/admins', label: '账号管理' },
    ],
  },
];

/**
 * 侧边导航：按权限过滤渲染。
 * 无权限的菜单项直接不渲染（不是置灰），子路径自动继承父级权限
 * （/products/new 继承 products.view 时用 view 兜底判断）。
 */
export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const has = (p: string) => permissions.includes(p);

  return (
    <nav className="a-nav">
      {GROUPS.map(g => {
        const visible = g.items.filter(item => {
          const need = PAGE_PERMISSIONS[item.href];
          if (!need) return true;
          if (has(need)) return true;
          // /products/new 需要 products.edit，但只有 products.view 时仍应看到入口（进去会拦截）
          if (item.href === '/products/new') return has('products.view');
          return false;
        });
        if (!visible.length) return null;
        return (
          <div key={g.label}>
            <div className="grp">{g.label}</div>
            {visible.map(item => {
              const on = pathname === item.href
                || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
              return (
                <Link key={item.href} href={item.href} className={on ? 'on' : ''}>
                  <span>{item.label}</span>
                  {item.badge && <i>{item.badge}</i>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
