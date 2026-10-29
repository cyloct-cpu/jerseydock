import Link from 'next/link';
import { registerAction } from '@/lib/auth-actions';
import { SendCodeButton } from '@/components/SendCodeButton';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/account';
  const email = typeof sp.email === 'string' ? sp.email : '';
  const name = typeof sp.name === 'string' ? sp.name : '';

  return (
    <div className="container auth-wrap">
      <div className="panel panel-pad auth-card">
        <span className="eyebrow">{t('au.join')}</span>
        <h1 className="h2" style={{ margin: '10px 0 20px', fontSize: 'clamp(24px,3vw,34px)' }}>{t('au.register')}</h1>

        {sp.error && <div className="auth-error" role="alert">{sp.error}</div>}

        <form action={registerAction} style={{ display: 'grid', gap: 14 }}>
          <input type="hidden" name="next" value={next} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="name">{t('au.name')}</label>
            <input id="name" className="input" type="text" name="name" required maxLength={40} autoComplete="name" placeholder={t('au.name_ph')} defaultValue={name} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="email">{t('acct.email')}</label>
            <input id="email" className="input" type="email" name="email" required autoComplete="email" defaultValue={email} placeholder="you@example.com" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="code">{t('au.code_label')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="code" className="input" name="code" required inputMode="numeric" maxLength={6} placeholder="6-digit code" style={{ flex: 1 }} />
              <SendCodeButton emailId="email" purpose="register" />
            </div>
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{t('au.code_sent_note')}</span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="password">{t('au.pw_register')}</label>
            <input id="password" className="input" type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="••••••••" />
          </div>
          <button className="btn btn-block" type="submit">{t('au.register')}</button>
        </form>

        <p className="dim" style={{ marginTop: 18 }}>
          {t('au.have_account')}{' '}
          <Link className="auth-link" href={`/login?next=${encodeURIComponent(next)}`}>{t('au.signin')}</Link>
        </p>
      </div>
    </div>
  );
}
