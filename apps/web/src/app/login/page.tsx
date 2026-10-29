import Link from 'next/link';
import { loginAction } from '@/lib/auth-actions';
import { AuthProviderButtons } from '@/components/AuthProviderButtons';
import { appleConfigured } from '@/lib/oauth';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; registered?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/account';

  return (
    <div className="container auth-wrap">
      <div className="panel panel-pad auth-card">
        <span className="eyebrow">{t('au.welcome')}</span>
        <h1 className="h2" style={{ margin: '10px 0 20px', fontSize: 'clamp(24px,3vw,34px)' }}>{t('au.signin')}</h1>

        {sp.error && <div className="auth-error" role="alert">{sp.error}</div>}
        {sp.registered && <div className="auth-ok">{t('au.created_ok')}</div>}

        <AuthProviderButtons next={next} appleEnabled={appleConfigured()} />

        <form action={loginAction} style={{ display: 'grid', gap: 14 }}>
          <input type="hidden" name="next" value={next} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="email">{t('acct.email')}</label>
            <input id="email" className="input" type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="password">{t('au.password')}</label>
            <input id="password" className="input" type="password" name="password" required autoComplete="current-password" placeholder="••••••••" />
          </div>
          <button className="btn btn-block" type="submit">{t('au.signin')}</button>
        </form>

        <p className="dim" style={{ marginTop: 18 }}>
          {t('au.new_here')}{' '}
          <Link className="auth-link" href={`/register?next=${encodeURIComponent(next)}`}>{t('au.create_account')}</Link>
        </p>
        <p className="dim" style={{ marginTop: 8 }}>
          {t('au.check_order')}
        </p>
      </div>
    </div>
  );
}
