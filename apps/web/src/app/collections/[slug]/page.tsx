import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { TextT9n } from '@/components/ContentT9n';
import { productsByCollection, categoryBySlug } from '@/lib/catalog';
import { Breadcrumb } from '@/components/Breadcrumb';

export const dynamic = 'force-dynamic';

const SORTS = [
  { id: 'sales', label: 'Popular' },
  { id: 'price-asc', label: 'Price ↑' },
  { id: 'price-desc', label: 'Price ↓' },
] as const;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = categoryBySlug(slug);
  if (!cat) return {};
  const count = productsByCollection(slug, 1000).length;
  return {
    title: `${cat.label} jerseys`,
    description: `Browse ${count} ${cat.label} jerseys at JERSEYDOCK. Fan, player and kids versions with worldwide delivery and 30-day returns.`,
    alternates: { canonical: `/collections/${slug}` },
  };
}

export default function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sort?: string; page?: string }> }) {
  const { slug } = use(params);
  const { sort: sortParam, page } = use(searchParams);
  const cat = categoryBySlug(slug);
  if (!cat) notFound();

  const sort = (SORTS.find(s => s.id === sortParam)?.id ?? 'sales') as 'sales' | 'price-asc' | 'price-desc';
  const perPage = 24;
  const current = Math.max(1, Number(page || 1));
  const all = productsByCollection(slug, 1000, sort);
  const start = (current - 1) * perPage;
  const items = all.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(all.length / perPage));

  return (
    <div className="container" style={{ paddingBlock: '40px 96px' }}>
      <Breadcrumb items={[{ label: cat.label }]} />
      <div className="section-head" style={{ marginBottom: 18 }}>
        <div>
          <span className="eyebrow">{cat.group}</span>
          <h1 className="h2" style={{ fontSize: 'clamp(26px, 3.4vw, 42px)' }}><TextT9n text={cat.label} /></h1>
        </div>
        <span className="dim">{all.length} items</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 26, flexWrap: 'wrap' }}>
        {SORTS.map(s => (
          <a key={s.id} className={`btn btn-ghost btn-sm${s.id === sort ? '' : ' btn-ghost'}`}
             style={s.id === sort ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
             href={`/collections/${slug}?sort=${s.id}`}>
            {s.label}
          </a>
        ))}
      </div>

      <div className="grid-products">
        {items.map((p, i) => (
          <Reveal key={p.h} delay={Math.min(i, 8) * 50}>
            <ProductCard product={p} priority={i < 4} />
          </Reveal>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 44, justifyContent: 'center' }}>
          {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => i + 1).map(n => (
            <a key={n} className="btn btn-ghost btn-sm" style={n === current ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
               href={`/collections/${slug}?sort=${sort}&page=${n}`}>{n}</a>
          ))}
          {totalPages > 8 && <span className="dim" style={{ alignSelf: 'center' }}>… {totalPages}</span>}
        </div>
      )}
    </div>
  );
}
