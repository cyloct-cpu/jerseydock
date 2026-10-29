'use client';

import Link from 'next/link';
import { useStore, useT, cartItemKey } from '@/lib/store';
import { Price } from '@/components/Price';
import { Breadcrumb } from '@/components/Breadcrumb';
import { TextT9n } from '@/components/ContentT9n';

export default function CartPage() {
  const { cart, setQty, removeFromCart, cartTotalUsd, cartCount } = useStore();
  const t = useT();

  if (!cart.length) {
    return (
      <div className="container" style={{ paddingBlock: '120px 170px', textAlign: 'center' }}>
        <Breadcrumb items={[{ labelKey: 'cart.title' }]} />
        <span className="eyebrow">{t('cart.items_n').replace('{n}', String(cartCount))}</span>
        <h1 className="h2" style={{ margin: '12px 0 20px', fontSize: 'clamp(24px,3vw,36px)' }}>{t('cart.empty')}</h1>
        <Link className="btn" href="/collections/2026-27-season">{t('cart.continue')}</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '48px 110px' }}>
      <Breadcrumb items={[{ labelKey: 'cart.title' }]} />
      <div className="section-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">{t('cart.items_n').replace('{n}', String(cartCount))}</span>
          <h1 className="h2" style={{ fontSize: 'clamp(26px,3.4vw,42px)' }}>{t('cart.title')}</h1>
        </div>
        <Link className="link-more" href="/collections/2026-27-season">{t('cart.continue')}</Link>
      </div>

      <div className="cart-layout">
        <div>
          {cart.map(item => (
            <div className="cart-row" key={cartItemKey(item.handle, item.size, item)}>
              <Link className="thumb" href={`/products/${item.handle}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.title} />
              </Link>
              <div>
                <Link href={`/products/${item.handle}`} style={{ fontWeight: 500 }}><TextT9n text={item.title} /></Link>
                <div className="dim" style={{ marginTop: 4 }}>{t('product.sizes')} · {item.size}</div>
                {(item.customText || item.armband) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{t('cart.custom')}:</span>
                    {item.customText && <span className="cart-custom">{t('cart.custom_name')} · {item.customText}</span>}
                    {item.armband && <span className="cart-custom">{t('cart.custom_armband')} · {item.armband}</span>}
                  </div>
                )}
                <div className="dim" style={{ marginTop: 2 }}><Price usd={item.price} /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="qty-box">
                  <button type="button" onClick={() => setQty(item.handle, item.size, item.qty - 1, item)} aria-label="Decrease quantity">−</button>
                  <span>{item.qty}</span>
                  <button type="button" onClick={() => setQty(item.handle, item.size, item.qty + 1, item)} aria-label="Increase quantity">+</button>
                </div>
                <button type="button" className="link-remove" onClick={() => removeFromCart(item.handle, item.size, item)}>
                  {t('cart.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="panel panel-pad cart-summary">
          <span className="eyebrow">{t('cart.summary')}</span>
          <div className="summary-row" style={{ marginTop: 12 }}>
            <span className="muted">{t('cart.subtotal')}</span>
            <b><Price usd={cartTotalUsd} /></b>
          </div>
          <div className="summary-row">
            <span className="muted">{t('bar.shipping')}</span>
            <span className="dim">{cartCount >= 3 ? t('checkout.free') : t('cart.ship_at_checkout')}</span>
          </div>
          <div className="summary-row dim">
            <span>{t('bar.returns')}</span>
            <span>{t('cart.returns_days')}</span>
          </div>
          <Link className="btn btn-block" href="/checkout" style={{ marginTop: 18 }}>{t('cart.checkout')}</Link>
          <p className="dim" style={{ marginTop: 12 }}>
            {t('cart.promo_note')}
          </p>
        </aside>
      </div>
    </div>
  );
}
