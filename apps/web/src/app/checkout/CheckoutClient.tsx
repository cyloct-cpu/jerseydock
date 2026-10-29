'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { COUNTRIES, COUNTRY_CITIES, COUNTRY_CODES } from '@kitvault/shared';
import { useStore, useT, cartItemKey } from '@/lib/store';
import { useCityDisplay } from '@/lib/use-city-display';
import { Price } from '@/components/Price';
import { Breadcrumb } from '@/components/Breadcrumb';
import { TextT9n } from '@/components/ContentT9n';
import { priceOrder } from '@/lib/pricing';
import { track } from '@/lib/track';
import { AutoComplete } from '@/components/AutoComplete';

/** 登录用户的账户资料（结账预填来源；未登录为 null） */
export type SavedCheckoutInfo = {
  email: string;
  name: string;
  phone?: string;
  address?: { address: string; city: string; country: string; zip: string };
  /** 地址簿（账户中心维护）：点选即整组填充下方表单 */
  addresses?: { id: string; address: string; city: string; country: string; zip: string }[];
} | null;

export type TransferInfo = {
  channel: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  swiftCode: string;
  note: string;
};

/** 在线支付通道状态：placeholder=未接入（占位说明）；stripe / paypal=托管收银台重定向 */
export type PaymentMode = 'placeholder' | 'stripe' | 'paypal';

const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  placeholder: '',
  stripe: 'Stripe',
  paypal: 'PayPal',
};

export default function CheckoutClient({ saved, paymentMode = 'placeholder', signedIn = false, transfer }: { saved: SavedCheckoutInfo; paymentMode?: PaymentMode; signedIn?: boolean; transfer?: TransferInfo | null }) {
  const { cart, cartTotalUsd, cartCount, currency, clearCart, locale } = useStore();
  const t = useT();

  // 国家本地化：Intl.DisplayNames 生成当前语言的国名（覆盖全部 29 种语言，零翻译 API）。
  // 下拉显示本地化名 + 匹配输入；提交/存储仍是英文规范名（物流依赖）。
  const countryDisplay = useMemo(() => {
    if (locale === 'en' || typeof Intl === 'undefined' || typeof (Intl as { DisplayNames?: unknown }).DisplayNames !== 'function') return {};
    const m: Record<string, string> = {};
    try {
      const dn = new Intl.DisplayNames(locale, { type: 'region' });
      for (const c of COUNTRIES) {
        const code = COUNTRY_CODES[c];
        if (!code) continue;
        const n = dn.of(code);
        if (n && n !== c) m[c] = n;
      }
    } catch { /* DisplayNames 不可用 → 英文 */ }
    return m;
  }, [locale]);

  const [form, setForm] = useState({
    email: saved?.email || '',
    name: saved?.name || '',
    phone: saved?.phone || '',
    address: saved?.address?.address || '',
    city: saved?.address?.city || '',
    country: saved?.address?.country || '',
    zip: saved?.address?.zip || '',
  });
  const [payMethod, setPayMethod] = useState<'cod' | 'online' | 'transfer'>('cod');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [guestUrl, setGuestUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // 城市建议名机翻（服务端缓存）；提交仍是英文名
  const cityDisplay = useCityDisplay(COUNTRY_CITIES[form.country] || []);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  // 国家 → 城市联动：选定国家后只提示该国城市；未录入城市库的国家（如 Other）退化为自由输入
  const cityOptions = COUNTRY_CITIES[form.country] || [];
  const cityHint = cityOptions.length
    ? t('checkout.city_suggest').replace('{n}', String(cityOptions.length))
    : t('checkout.city_suggest_none');

  const pricing = priceOrder(cartTotalUsd, cartCount);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cart.length) return;
    setStatus('sending');
    setError('');
    track({ type: 'checkout_start', email: form.email, meta: { totalUsd: pricing.totalUsd, items: cartCount } });
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            handle: i.handle,
            size: i.size,
            qty: i.qty,
            ...(i.customText ? { customText: i.customText } : {}),
            ...(i.armband ? { armband: i.armband } : {}),
          })),
          currency,
          paymentMethod: payMethod,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || t('checkout.err_create'));
      // 本地订单簿（免登录查单用）
      try {
        const key = 'kv_orders';
        const prev = JSON.parse(window.localStorage.getItem(key) || '[]');
        prev.unshift({ orderNo: data.orderNo, email: form.email, totalUsd: data.totalUsd, createdAt: new Date().toISOString() });
        window.localStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
      } catch {}
      // 在线支付：创建托管收银台会话并跳转（Stripe / PayPal）
      if (payMethod === 'online') {
        try {
          const pRes = await fetch('/api/payment/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNo: data.orderNo }),
          });
          const pData = await pRes.json();
          if (pData.ok && pData.status === 'redirect' && pData.url) {
            clearCart(); // 支付会话已创建，清空购物车
            window.location.href = pData.url;
            return;
          }
        } catch { /* 创建失败则回落到「待支付」说明，订单仍有效 */ }
      }
      setOrderNo(data.orderNo);
      setGuestUrl(data.guestUrl || '');
      setStatus('done');
      clearCart();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : t('checkout.err_generic'));
    }
  }

  if (status === 'done') {
    return (
      <div className="container" style={{ paddingBlock: '100px 170px' }}>
        <div className="panel panel-pad success-panel">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>{t('checkout.received')}</span>
          <h1 className="h2" style={{ margin: '12px 0 14px', fontSize: 'clamp(24px,3vw,36px)' }}>
            {t('checkout.thanks').replace('{no}', orderNo)}
          </h1>
          <p className="muted" style={{ maxWidth: '52ch', margin: '0 auto' }}>
            {payMethod === 'cod'
              ? t('checkout.cod_note')
              : payMethod === 'transfer'
                ? (transfer?.note ? <TextT9n text={transfer.note} /> : t('checkout.transfer_note'))
                : t('checkout.paynote')}
          </p>
          {!signedIn && guestUrl && (
            <p className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 10 }}>
              {t('checkout.tip_save_link')}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* 登录客户 → 账户订单详情页；游客 → 签名链接订单页（含物流轨迹与售后入口），可复制收藏 */}
            {signedIn ? (
              <Link className="btn" href={`/account/orders/${encodeURIComponent(orderNo)}`}>
                {t('track.go')}
              </Link>
            ) : guestUrl ? (
              <>
                <Link className="btn" href={guestUrl}>{t('checkout.view_order')}</Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { try { navigator.clipboard.writeText(new URL(guestUrl, location.origin).href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
                >
                  {copied ? t('checkout.link_copied') : t('checkout.copy_link')}
                </button>
              </>
            ) : null}
            <Link className="btn btn-ghost" href="/collections/2026-27-season">{t('cart.continue')}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!cart.length) {
    return (
      <div className="container" style={{ paddingBlock: '120px 170px', textAlign: 'center' }}>
        <span className="eyebrow">{t('checkout.title')}</span>
        <h1 className="h2" style={{ margin: '12px 0 20px', fontSize: 'clamp(24px,3vw,36px)' }}>{t('cart.empty')}</h1>
        <Link className="btn" href="/collections/2026-27-season">{t('cart.continue')}</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingBlock: '48px 110px' }}>
      <Breadcrumb items={[{ href: '/cart', labelKey: 'cart.title' }, { labelKey: 'checkout.title' }]} />
      <div className="section-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">{t('checkout.title')}</span>
          <h1 className="h2" style={{ fontSize: 'clamp(26px,3.4vw,42px)' }}>{t('checkout.title')}</h1>
        </div>
        <Link className="link-more" href="/cart">{t('cart.title')} · {cartCount}</Link>
      </div>

      <form className="checkout-grid" onSubmit={submit}>
        <div>
          {saved && (
            <p className="dim" style={{ fontSize: 'var(--fs-micro)', marginBottom: 14 }}>
              {t('checkout.prefilled_a')}{' '}
              <Link href="/account" style={{ borderBottom: '1px solid var(--line-2)' }}>{t('checkout.prefilled_b')}</Link>{' '}
              {t('checkout.prefilled_c')}
            </p>
          )}
          {/* 地址簿：一键填充（选中态高亮；仍可手改任意字段） */}
          {!!saved?.addresses?.length && (
            <div style={{ marginBottom: 14, display: 'grid', gap: 8 }}>
              <span className="eyebrow">{t('checkout.saved_addresses')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {saved.addresses.map((a, i) => {
                  const on = form.address === a.address && form.city === a.city && form.country === a.country && form.zip === a.zip;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, address: a.address, city: a.city, country: a.country, zip: a.zip }))}
                      style={{
                        textAlign: 'left', padding: '10px 12px', cursor: 'pointer', borderRadius: 3,
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
                        background: on ? 'var(--accent-dim, rgba(0,0,0,0.2))' : 'transparent',
                        color: 'var(--text-2)', fontSize: 'var(--fs-small)', lineHeight: 1.5,
                      }}
                    >
                      <span className="tag on" style={{ marginRight: 6 }}>{i === 0 ? t('checkout.default') : `#${i + 1}`}</span>
                      {a.address || '—'}, {a.city} {a.zip}, {countryDisplay[a.country] || a.country}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <section className="panel panel-pad" style={{ marginBottom: 18 }}>
            <span className="eyebrow">{t('checkout.contact')}</span>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="email">{t('checkout.email')}</label>
                <input id="email" className="input" type="email" required value={form.email} onChange={e => set('email')(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="field">
                <label htmlFor="name">{t('checkout.name')}</label>
                <input id="name" className="input" required value={form.name} onChange={e => set('name')(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="phone">{t('checkout.phone_delivery')}</label>
                <input id="phone" className="input" type="tel" required value={form.phone} onChange={e => set('phone')(e.target.value)} placeholder="+66 …" />
              </div>
            </div>
          </section>

          <section className="panel panel-pad">
            <span className="eyebrow">{t('checkout.address')}</span>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="address">{t('checkout.address2')}</label>
                <input id="address" className="input" required value={form.address} onChange={e => set('address')(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="city">{t('checkout.city')}</label>
                <AutoComplete
                  id="city"
                  value={form.city}
                  onChange={set('city')}
                  options={cityOptions}
                  display={cityDisplay}
                  placeholder={t('checkout.city_ph')}
                  hint={cityHint}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="zip">{t('checkout.zip')}</label>
                <input id="zip" className="input" required value={form.zip} onChange={e => set('zip')(e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="country">{t('checkout.country')}</label>
                <AutoComplete
                  id="country"
                  value={form.country}
                  onChange={set('country')}
                  options={COUNTRIES}
                  display={countryDisplay}
                  placeholder={t('checkout.country_ph')}
                  hint={t('checkout.country_hint')}
                  required
                />
              </div>
            </div>
          </section>

          <section className="panel panel-pad" style={{ marginTop: 18 }}>
            <span className="eyebrow">{t('checkout.payment')}</span>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {/* 货到付款：无需在线支付，送货时现金结算（当前默认） */}
              <label style={{
                display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${payMethod === 'cod' ? 'var(--accent)' : 'var(--line-2)'}`,
                background: payMethod === 'cod' ? 'var(--accent-dim)' : 'transparent',
                borderRadius: 3, padding: '12px 14px',
              }}>
                <input
                  type="radio" name="payMethod" value="cod"
                  checked={payMethod === 'cod'} onChange={() => setPayMethod('cod')}
                  style={{ accentColor: 'var(--accent)', marginTop: 2 }}
                />
                <span>
                  <b style={{ fontWeight: 500, color: payMethod === 'cod' ? 'var(--accent)' : 'var(--text)' }}>{t('checkout.pay_cod')}</b>
                  <span style={{ display: 'block', fontSize: 'var(--fs-micro)', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.6 }}>{t('checkout.pay_cod_desc')}</span>
                </span>
              </label>

              {/* 在线支付：已配置通道 → 跳转托管收银台；未配置 → 占位说明 */}
              <label style={{
                display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${payMethod === 'online' ? 'var(--accent)' : 'var(--line-2)'}`,
                background: payMethod === 'online' ? 'var(--accent-dim)' : 'transparent',
                borderRadius: 3, padding: '12px 14px',
              }}>
                <input
                  type="radio" name="payMethod" value="online"
                  checked={payMethod === 'online'} onChange={() => setPayMethod('online')}
                  style={{ accentColor: 'var(--accent)', marginTop: 2 }}
                />
                <span>
                  <b style={{ fontWeight: 500, color: payMethod === 'online' ? 'var(--accent)' : 'var(--text)' }}>
                    {paymentMode === 'placeholder' ? t('checkout.paysoon') : `${t('checkout.pay_redirect_title')}${PAYMENT_MODE_LABEL[paymentMode] ? ` · ${PAYMENT_MODE_LABEL[paymentMode]}` : ''}`}
                  </b>
                  <span style={{ display: 'block', fontSize: 'var(--fs-micro)', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.6 }}>
                    {paymentMode === 'placeholder' ? t('checkout.paynote') : t('checkout.pay_redirect_desc')}
                  </span>
                </span>
              </label>

              {/* 转账收款（万里汇 / XTransfer）：展示收款信息，下单后人工确认到账 */}
              {transfer && transfer.accountNumber && (
                <label style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
                  border: `1px solid ${payMethod === 'transfer' ? 'var(--accent)' : 'var(--line-2)'}`,
                  background: payMethod === 'transfer' ? 'var(--accent-dim)' : 'transparent',
                  borderRadius: 3, padding: '12px 14px',
                }}>
                  <input
                    type="radio" name="payMethod" value="transfer"
                    checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')}
                    style={{ accentColor: 'var(--accent)', marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <b style={{ fontWeight: 500, color: payMethod === 'transfer' ? 'var(--accent)' : 'var(--text)' }}>
                      {t('checkout.pay_transfer').replace('{channel}', transfer.channel)}
                    </b>
                    <span style={{ display: 'block', fontSize: 'var(--fs-micro)', color: 'var(--text-3)', marginTop: 3, lineHeight: 1.6 }}>
                      {t('checkout.pay_transfer_desc')}
                    </span>
                    {payMethod === 'transfer' && (
                      <span style={{ display: 'block', marginTop: 8, padding: '8px 10px', border: '1px solid var(--line-2)', borderRadius: 3, fontSize: 'var(--fs-micro)', lineHeight: 1.8, color: 'var(--text-2)' }}>
                        {t('checkout.pay_transfer_name')}：<b className="mono" style={{ color: 'var(--text)' }}>{transfer.accountName}</b><br />
                        {t('checkout.pay_transfer_account')}：<b className="mono" style={{ color: 'var(--text)' }}>{transfer.accountNumber}</b><br />
                        {t('checkout.pay_transfer_bank')}：{transfer.bankName}{transfer.swiftCode ? <> · SWIFT: {transfer.swiftCode}</> : null}
                        {transfer.note ? <><br /><TextT9n text={transfer.note} /></> : null}
                      </span>
                    )}
                  </span>
                </label>
              )}
            </div>
          </section>
        </div>

        <aside className="panel panel-pad cart-summary">
          <span className="eyebrow">{t('checkout.order_summary')}</span>
          <div style={{ marginTop: 12 }}>
            {cart.map(item => (
              <div className="order-mini" key={cartItemKey(item.handle, item.size, item)}>
                <div className="thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.title} />
                </div>
                <div>
                  <div style={{ color: 'var(--text)' }}><TextT9n text={item.title} /></div>
                  <div className="dim">{item.size} · ×{item.qty}</div>
                  {(item.customText || item.armband) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {item.customText && <span className="cart-custom">{t('cart.custom_name')} · {item.customText}</span>}
                      {item.armband && <span className="cart-custom">{t('cart.custom_armband')} · {item.armband}</span>}
                    </div>
                  )}
                </div>
                <div><Price usd={item.price * item.qty} /></div>
              </div>
            ))}
          </div>
          <div className="summary-row" style={{ marginTop: 14 }}>
            <span className="muted">{t('cart.subtotal')}</span>
            <b><Price usd={pricing.subtotalUsd} /></b>
          </div>
          {pricing.discountUsd > 0 && (
            <div className="summary-row" style={{ color: 'var(--accent)' }}>
              <span>{t('checkout.multibuy')}</span>
              <b>−<Price usd={pricing.discountUsd} /></b>
            </div>
          )}
          <div className="summary-row">
            <span className="muted">{t('bar.delivery')}</span>
            <span>{pricing.shippingUsd === 0 ? t('checkout.free') : <Price usd={pricing.shippingUsd} />}</span>
          </div>
          <div className="summary-row total">
            <span>{t('checkout.total')}</span>
            <b><Price usd={pricing.totalUsd} /></b>
          </div>
          <button className="btn btn-block" type="submit" disabled={status === 'sending'} style={{ marginTop: 16 }}>
            {status === 'sending' ? t('checkout.placing') : t('checkout.place')}
          </button>
          {status === 'error' && <p style={{ color: '#E5484D', fontSize: 'var(--fs-small)', marginTop: 12 }}>{error}</p>}
          <p className="dim" style={{ marginTop: 12 }}>
            {t('checkout.currency_note').replace('{cur}', currency)}
          </p>
        </aside>
      </form>
    </div>
  );
}
