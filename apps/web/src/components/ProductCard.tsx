'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/store';
import { format } from '@kitvault/shared';
import type { SlimProduct } from '@kitvault/shared';
import type { VisitorsConfig } from '@/lib/brand';
import { LiveVisitors } from '@/components/LiveVisitors';

/** 价格（USD 基准 → 当前币种换算） */
export function Price({ usd }: { usd: number }) {
  const { currency, rates } = useStore();
  return <>{format(usd, currency, rates[currency])}</>;
}

export function ProductCard({
  product,
  priority = false,
  visitors,
  liveCount = 0,
}: {
  product: SlimProduct;
  priority?: boolean;
  /** 传入则显示访客数（列表页由服务端算好，避免 N 张卡狂发心跳） */
  visitors?: VisitorsConfig;
  liveCount?: number;
}) {
  const { addToCart } = useStore();
  const t = useT();

  return (
    <article className="card">
      <Link href={`/products/${product.h}`}>
        <div className="thumb">
          <img
            src={product.v || product.i[0]}
            alt={product.t}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
          <div className="quick">
            <button
              className="btn btn-sm btn-block"
              onClick={e => {
                e.preventDefault();
                const size = product.s[0] || 'M';
                addToCart({ handle: product.h, title: product.t, price: product.p, size, image: product.v || product.i[0] });
              }}
            >
              {t('product.add')}
            </button>
          </div>
        </div>
      </Link>
      <div className="meta">
        <Link href={`/products/${product.h}`} className="name">{product.t}</Link>
        <span className="sub">{product.cl.slice(0, 2).map(c => c.replace(/-/g, ' ')).join(' · ')}</span>
        <div className="price">
          <Price usd={product.p} />
          {product.c > product.p && <span className="was"><Price usd={product.c} /></span>}
          {product.o > 0 && <span className="sale">-{product.o}%</span>}
        </div>
        {visitors?.enabled && (
          <div style={{ marginTop: 6 }}>
            <LiveVisitors handle={product.h} real={liveCount} config={visitors} compact />
          </div>
        )}
      </div>
    </article>
  );
}
