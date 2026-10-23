import Link from 'next/link';
import { groups } from '@/lib/catalog';
import { Reveal } from '@/components/Reveal';
import { TextT9n } from '@/components/ContentT9n';
import { Breadcrumb } from '@/components/Breadcrumb';

export const metadata = { title: 'National teams' };

export default function NationsPage() {
  const list = groups().nation;
  return (
    <div className="container" style={{ paddingBlock: '48px 96px' }}>
      <Breadcrumb items={[{ label: 'National teams' }]} />
      <span className="eyebrow">Nations</span>
      <h1 className="h2" style={{ fontSize: 'clamp(28px, 3.6vw, 46px)', margin: '10px 0 34px' }}><TextT9n text="National teams" /></h1>
      <div className="cat-grid">
        {list.map((c, i) => (
          <Reveal key={c.slug} delay={Math.min(i, 12) * 40} as="div">
            <Link href={`/collections/${c.slug}`}><span title={c.label}>{c.label}</span><i>{c.count}</i></Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
