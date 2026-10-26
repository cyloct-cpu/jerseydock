'use client';

import { useState } from 'react';
import { useStore, useT } from '@/lib/store';
import { track } from '@/lib/track';
import { Price } from '@/components/Price';
import type { SlimProduct } from '@kitvault/shared';
import type { CustomizeConfig } from '@/lib/brand';

/**
 * 商品定制与购买区
 * 结构对齐参考站：尺码 → 数量 → 姓名号码烫印 → 袖章选择 → 加入购物车 / 立即购买
 * 定制项与选项文案均可在后台「商店设置」中调整，对所有商品统一生效。
 */
export function AddToCart({
  product,
  sizes,
  customize,
}: {
  product: SlimProduct;
  sizes: string[];
  customize: CustomizeConfig;
}) {
  const { addToCart } = useStore();
  const t = useT();
  const [size, setSize] = useState(sizes[0]);
  const [qty, setQty] = useState(1);
  const [customText, setCustomText] = useState('');
  const [armband, setArmband] = useState<string>('');
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  const showName = customize.enabled && customize.nameNumber.enabled;
  const showArmband = customize.enabled && customize.armband.enabled && customize.armband.options.length > 0;

  const textPrice = showName && customText.trim() ? customize.nameNumber.price : 0;
  const armbandPrice = showArmband && armband
    ? customize.armband.options.find(o => o.label === armband)?.price ?? 0
    : 0;
  const extra = textPrice + armbandPrice;
  const unit = product.p + extra;
  const total = unit * qty;

  const commit = () => {
    const text = customText.trim();
    if (showName && text && text.length > customize.nameNumber.maxLength) {
      setError(t('product.name_max').replace('{n}', String(customize.nameNumber.maxLength)));
      return null;
    }
    return {
      customText: text || undefined,
      armband: armband || undefined,
      price: unit,
    };
  };

  const add = () => {
    const c = commit();
    if (!c) return;
    setError('');
    addToCart({
      handle: product.h,
      title: product.t,
      price: c.price,
      size,
      image: product.v || product.i[0],
      customText: c.customText,
      armband: c.armband,
    }, qty);
    track({ type: 'add_to_cart', handle: product.h, size });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const buyNow = () => {
    const c = commit();
    if (!c) return;
    setError('');
    addToCart({
      handle: product.h,
      title: product.t,
      price: c.price,
      size,
      image: product.v || product.i[0],
      customText: c.customText,
      armband: c.armband,
    }, qty);
    // checkout_start 由结账页统一上报 —— 这里曾重复上报一次，导致漏斗"开始结算 > 加购"（120%）
    window.location.href = '/checkout';
  };

  return (
    <div className="buy">
      {/* 尺码 */}
      <div className="buy-block">
        <span className="eyebrow">{t('product.sizes')} · {size}</span>
        <div className="size-row">
          {sizes.map(s => (
            <button key={s} type="button" className="size" aria-pressed={s === size} onClick={() => setSize(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* 数量 */}
      <div className="buy-block">
        <span className="eyebrow">{t('product.qty')}</span>
        <div className="qty-box" style={{ width: 'fit-content' }}>
          <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="减少数量">−</button>
          <span aria-live="polite">{qty}</span>
          <button type="button" onClick={() => setQty(q => Math.min(99, q + 1))} aria-label="增加数量">+</button>
        </div>
      </div>

      {/* 定制：姓名 + 号码 */}
      {showName && (
        <div className="buy-block">
          <label className="eyebrow" htmlFor="custom-text">
            {t('product.custom_name')} <span className="buy-fee">(+<Price usd={customize.nameNumber.price} />)</span>
          </label>
          <input
            id="custom-text"
            className="input"
            value={customText}
            onChange={e => setCustomText(e.target.value.slice(0, customize.nameNumber.maxLength))}
            placeholder={customize.nameNumber.placeholder}
            maxLength={customize.nameNumber.maxLength}
          />
        </div>
      )}

      {/* 定制：袖章补丁 */}
      {showArmband && (
        <div className="buy-block">
          <span className="eyebrow">
            {t('product.armband_pick')}
            <span className="buy-fee">
              (+<Price usd={Math.min(...customize.armband.options.map(o => o.price))} /> {t('product.each')})
            </span>
          </span>
          <div className="patch-row">
            {customize.armband.options.map(o => (
              <button
                key={o.label}
                type="button"
                className={`patch${armband === o.label ? ' on' : ''}`}
                onClick={() => setArmband(armband === o.label ? '' : o.label)}
                aria-pressed={armband === o.label}
                title={`${o.label} (+${o.price} USD)`}
              >
                <span className="patch-check" aria-hidden>{armband === o.label ? '✓' : ''}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.image} alt="" loading="lazy" />
                <span className="patch-label">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="buy-error" role="alert">{error}</p>}

      {/* 双按钮 */}
      <div className="buy-actions">
        <button type="button" className="btn btn-block btn-ghost" onClick={add}>
          {added ? `${t('product.added')} ✓` : <>{t('product.add')}{extra > 0 && <> · <Price usd={total} /></>}</>}
        </button>
        <button type="button" className="btn btn-block" onClick={buyNow}>{t('product.buy_now')}</button>
      </div>

      <ul className="buy-notes">
        <li>{t('bar.shipping')}</li>
        <li>{t('product.note_returns')}</li>
        <li>{t('product.note_sustain')}</li>
        <li>{t('product.note_cod')}</li>
      </ul>
    </div>
  );
}
