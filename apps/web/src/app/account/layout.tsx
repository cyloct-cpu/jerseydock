import { redirect } from 'next/navigation';
import { getSessionUserFull } from '@/lib/users';
import { logoutAction } from '@/lib/auth-actions';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';
import { AccountNav } from './AccountNav';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserFull();
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  if (!user) redirect('/login?next=/account');

  return (
    <div className="container" style={{ paddingBlock: '48px 110px' }}>
      <div className="acct-grid">
        <aside>
          <div style={{ marginBottom: 18 }}>
            <span className="eyebrow">Account</span>
            <div style={{ marginTop: 8, fontSize: 'var(--fs-body)', color: 'var(--text)' }}>{user.name || t('acct.myorders') === '我的订单' ? user.name : user.name}</div>
            <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 2, wordBreak: 'break-all' }}>{user.email}</div>
          </div>
          <AccountNav />
          <form action={logoutAction} style={{ marginTop: 10 }}>
            <button type="submit" className="acct-signout">{t('acct.signout')}</button>
          </form>
        </aside>
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
