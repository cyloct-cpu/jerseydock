import Link from 'next/link';
import { groups } from '@/lib/catalog';
import { Reveal } from '@/components/Reveal';
import { TextT9n } from '@/components/ContentT9n';
import { Breadcrumb } from '@/components/Breadcrumb';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';

export const metadata = { title: 'National teams' };

export default async function NationsPage() {
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  const list = groups().nation;
  return (
    <div className="container" style={{ paddingBlock: '48px 96px' }}>
      <Breadcrumb items={[{ labelKey: 'nav.nations_title' }]} />
      <span className="eyebrow">{t('nav.nations')}</span>
      <h1 className="h2" style={{ fontSize: 'clamp(28px, 3.6vw, 46px)', margin: '10px 0 34px' }}>{t('nav.nations_title')}</h1>
      <div className="cat-grid">
        {list.map((c, i) => (
          <Reveal key={c.slug} delay={Math.min(i, 12) * 40} as="div">
            <Link href={`/collections/${c.slug}`}><span title={c.label}><TextT9n text={c.label} /></span><i>{c.count}</i></Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
