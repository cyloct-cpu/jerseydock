'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/store';

const NAV = [
  { href: '/account', k: 'acct.nav_overview' },
  { href: '/account/orders', k: 'acct.nav_orders' },
  { href: '/account/addresses', k: 'acct.nav_addresses' },
  { href: '/account/password', k: 'acct.nav_password' },
];

/** 账户中心侧边导航（客户端：高亮当前分区） */
export function AccountNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="acct-nav">
      {NAV.map(n => {
        const on = n.href === '/account' ? pathname === '/account' : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
            {t(n.k)}
          </Link>
        );
      })}
    </nav>
  );
}
