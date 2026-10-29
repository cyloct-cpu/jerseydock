import { getSessionUserFull } from '@/lib/users';
import { changePasswordAction } from '@/lib/auth-actions';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';
import { SendCodeButton } from '@/components/SendCodeButton';
import { PasswordInput } from '@/components/PasswordInput';
import { T } from '@/components/ContentT9n';

export const dynamic = 'force-dynamic';

export default async function AccountPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getSessionUserFull();
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  if (!user) return null; // layout 已做登录守卫
  const sp = await searchParams;

  return (
    <>
      <div className="page-head" style={{ padding: 0, marginBottom: 20 }}>
        <div>
          <span className="eyebrow">{t('acct.title')} · {t('acct.nav_password')}</span>
          <h1 style={{ marginTop: 6, fontSize: 'clamp(24px,3vw,34px)' }}><T k="acct.pw_h1" /></h1>
        </div>
      </div>

      {sp.error && <div className="notice bad" style={{ marginBottom: 16 }}>{sp.error}</div>}

      <section className="panel panel-pad">
        <form action={changePasswordAction} style={{ marginTop: 4, display: 'grid', gap: 14, maxWidth: 520 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw-old"><T k="pw.current" /></label>
            <input id="pw-old" className="input" name="oldPassword" type="password" required autoComplete="current-password" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw-code"><T k="pw.code" /></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="pw-code" className="input" name="code" required inputMode="numeric" maxLength={6} placeholder={t('pw.code_ph')} style={{ flex: 1 }} />
              <div style={{ flex: 'none', width: 150 }}><SendCodeButton purpose="password" email={user.email} /></div>
            </div>
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}><T k="pw.code_sent_to" values={{ email: user.email }} /></span>
          </div>
          <PasswordInput name="newPassword" label={t('pw.new')} required />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="pw-confirm"><T k="pw.confirm" /></label>
            <input id="pw-confirm" className="input" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <button className="btn" type="submit"><T k="pw.update" /></button>
          </div>
        </form>
      </section>
    </>
  );
}
