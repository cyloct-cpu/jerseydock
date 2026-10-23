import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { use } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { Breadcrumb } from '@/components/Breadcrumb';
import { productByHandle, similarProducts, categoryBySlug } from '@/lib/catalog';
import { trackView } from '@/lib/track';
import { AddToCart } from './AddToCart';
import { Price } from '@/components/Price';
import { Gallery } from '@/components/Gallery';
import { ProductContentT9n } from '@/components/ContentT9n';
import { LiveVisitors } from '@/components/LiveVisitors';
import { loadBrand } from '@/lib/brand';
import { activeVisitors } from '@/lib/visitors';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ handle: string }> };

/** 每件商品独立的 title / description / OG 图 / canonical（SEO 核心） */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const product = productByHandle(handle);
  if (!product) return {};
  const description = (product.d || `${product.t} — fan, player and kids versions. Worldwide delivery, 30-day returns.`).slice(0, 158);
  return {
    title: product.t,
    description,
    alternates: { canonical: `/products/${product.h}` },
    openGraph: {
      title: product.t,
      description,
      type: 'website',
      images: product.v ? [{ url: product.v }] : undefined,
    },
  };
}

export default function ProductPage({ params }: Props) {
  const { handle } = use(params);
  const product = productByHandle(handle);
  if (!product) notFound();
  trackView(product.h);

  const images = product.i.length ? product.i : [product.v];
  const sizes = product.s.length ? product.s : ['S', 'M', 'L', 'XL', '2XL'];
  const similar = similarProducts(product, 4);
  const { visitors, customize } = loadBrand();
  const live = activeVisitors(visitors.windowMinutes);

  // Product 结构化数据：Google 搜索结果展示价格/库存富摘要
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.t,
    description: (product.d || `${product.t} — worldwide delivery, 30-day returns.`).slice(0, 300),
    image: images.map(src => (src.startsWith('http') ? src : `https://jerseydock.shop${src}`)),
    brand: { '@type': 'Brand', name: 'JERSEYDOCK' },
    offers: {
      '@type': 'Offer',
      url: `https://jerseydock.shop/products/${product.h}`,
      priceCurrency: 'USD',
      price: product.p.toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <Breadcrumb
        items={[
          ...(product.cl.length
            ? [{
                href: `/collections/${product.cl[0]}`,
                label: categoryBySlug(product.cl[0])?.label ?? product.cl[0].replace(/-/g, ' '),
              }]
            : []),
          { label: product.t },
        ]}
      />
      <div className="pdp">
        <div>
          <Gallery images={images} title={product.t} />
        </div>

        <div className="pdp-info">
          <h1 id="pdp-title" className="display" style={{ margin: '0 0 12px' }}>{product.t}</h1>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 500 }}>
              {/* 价格（USD 基准 → 当前币种换算） */}
              <Price usd={product.p} />
            </span>
            {product.c > product.p && (
              <span className="dim" style={{ textDecoration: 'line-through' }}>
                <Price usd={product.c} />
              </span>
            )}
            {product.o > 0 && <span className="card sale">-{product.o}%</span>}
          </div>
          {product.sa > 0 && <p className="dim" style={{ marginTop: 6 }}>{product.sa} sold</p>}

          <div style={{ marginTop: 10 }}>
            <LiveVisitors handle={product.h} real={live.byHandle[product.h] ?? 0} config={visitors} />
          </div>

          <AddToCart product={product} sizes={sizes} customize={customize} />

          <div className="pdp-block">
            <div className="kv"><b>Size</b><span>{sizes.join(' · ')}</span></div>
            <div className="kv" style={{ marginTop: 8 }}><b>Version</b><span>Fan / Player / Kids</span></div>
            <div className="kv" style={{ marginTop: 8 }}><b>Delivery</b><span>7–15 days worldwide, tracked</span></div>
            <div className="kv" style={{ marginTop: 8 }}><b>Returns</b><span>30 days, full refund</span></div>
          </div>

          {product.d && (
            <div className="pdp-block">
              <span className="eyebrow">Description</span>
              <p id="pdp-desc" className="muted" style={{ marginTop: 10 }}>{product.d}</p>
            </div>
          )}
        </div>
      </div>

      <ProductContentT9n handle={product.h} description={product.d} />

      <section className="section">
        <div className="section-head">
          <h2 className="h2">You may also like</h2>
          <Link className="link-more" href="/collections/2026-27-season">View all</Link>
        </div>
        <div className="grid-products">
          {similar.map((p, i) => (
            <Reveal key={p.h} delay={i * 60}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 相似推荐（服务端取数） */
