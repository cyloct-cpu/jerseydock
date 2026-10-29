import Link from 'next/link';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function NotFound() {
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  return (
    <div className="container" style={{ paddingBlock: '140px 200px', textAlign: 'center' }}>
      <span className="eyebrow">404</span>
      <h1 className="h2" style={{ margin: '12px 0 18px', fontSize: 'clamp(24px,3vw,36px)' }}>
        {t('nf.title')}
      </h1>
      <p className="muted" style={{ maxWidth: '46ch', margin: '0 auto 26px' }}>
        {t('nf.body')}
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn" href="/collections/2026-27-season">{t('hero.cta')}</Link>
        <Link className="btn btn-ghost" href="/">{t('nf.cta_home')}</Link>
      </div>
    </div>
  );
}
