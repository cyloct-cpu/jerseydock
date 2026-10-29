import Link from 'next/link';
import { Price } from './Price';
import { Breadcrumb } from './Breadcrumb';
import { TrackEvents } from './TrackEvents';
import { RefundButton } from './RefundButton';
import { carrierTrackingUrl, FULFILLMENT_LABEL } from '@/lib/shipping';
import { translate, type Locale } from '@/lib/i18n';

/**
 * 订单详情共享视图（服务端组件）
 * 登录订单详情页（/account/orders/[orderNo]）与游客签名链接页（/orders/guest/[orderNo]）共用：
 * 订单头 + 商品明细 + 金额 + 收货地址 + 物流（单号/轨迹/17TRACK 直达）+ 退款入口。
 * locale 由调用方（页面）从 cookie 读出传入，文案走服务端词典（含 MT 补全）。
 */
export type OrderDetailOrder = {
  orderNo: string;
  email: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  zip?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  subtotalUsd?: number;
  discountUsd?: number;
  shippingUsd?: number;
  totalUsd: number;
  createdAt: string;
  shipment?: { carrier: string; trackingNo: string; status?: string; events?: { time: string; location: string; description: string }[] };
  items?: { handle?: string; title: string; qty: number; size: string; priceUsd: number; image?: string; customText?: string; armband?: string }[];
};

const PAYMENT_KEY: Record<string, string> = {
  pending: 'pay.pending',
  paid: 'pay.paid',
  refunded: 'pay.refunded',
  cancelled: 'pay.cancelled',
  cod: 'pay.cod',
};

export function OrderDetailView({
  order,
  breadcrumb,
  customerName,
  whatsapp,
  supportEmail,
  locale = 'en',
}: {
  order: OrderDetailOrder;
  /** 面包屑中段（如 My orders）；游客页可不传 */
  breadcrumb?: { href: string; label: string }[];
  customerName?: string;
  whatsapp: string;
  supportEmail: string;
  /** 服务端语言（调用方经 getLocaleFromCookies 读 cookie） */
  locale?: Locale | string;
}) {
  const t = (k: string, values?: Record<string, string | number>) => {
    let out = translate(locale as Locale, k);
    if (values) for (const [vk, vv] of Object.entries(values)) out = out.replaceAll(`{${vk}}`, String(vv));
    return out;
  };
  const dateFmt = (() => {
    try { return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  })();

  const shipment = order.shipment?.trackingNo ? order.shipment : null;
  const statusKey = order.fulfillmentStatus || shipment?.status || 'unfulfilled';
  const paymentLabel = PAYMENT_KEY[order.paymentStatus || '']
    ? t(PAYMENT_KEY[order.paymentStatus || ''])
    : (order.paymentStatus || '');
  const qtyTotal = order.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0;

  return (
    <>
      <Breadcrumb
        items={[
          ...breadcrumb || [],
          { label: order.orderNo },
        ]}
      />

      {/* 订单头：单号 + 状态 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <span className="eyebrow">{t('od.order')}</span>
          <h1 style={{ margin: '6px 0 4px', fontSize: 'clamp(22px,3vw,30px)' }}>{order.orderNo}</h1>
          <p className="dim" style={{ fontSize: 'var(--fs-small)' }}>
            {t('od.placed', { date: dateFmt.format(new Date(order.createdAt)), n: qtyTotal })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`tag${order.paymentStatus === 'paid' ? ' on' : ''}`}>{t('od.payment')}: {paymentLabel}</span>
          <span className={`tag${statusKey === 'delivered' ? ' on' : ''}`}>{t(`ful.${statusKey}`) || FULFILLMENT_LABEL[statusKey] || statusKey}</span>
          <RefundButton orderNo={order.orderNo} whatsapp={whatsapp} supportEmail={supportEmail} />
        </div>
      </div>

      {/* 商品明细 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <span className="eyebrow">{t('od.items')}</span>
        <div style={{ marginTop: 10 }}>
          {order.items?.map((item, i) => (
            <div className="order-mini" key={i}>
              <div className="thumb">
                {item.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'var(--text-3)', fontSize: 10 }}>KIT</div>}
              </div>
              <div style={{ minWidth: 0 }}>
                {item.handle
                  ? <Link href={`/products/${item.handle}`} style={{ color: 'var(--text)' }}>{item.title}</Link>
                  : <span style={{ color: 'var(--text)' }}>{item.title}</span>}
                <div className="dim" style={{ fontSize: 'var(--fs-small)' }}>{item.size} · ×{item.qty}</div>
                {(item.customText || item.armband) && (
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)', marginTop: 2 }}>
                    {item.customText ? t('od.name_number', { v: item.customText }) : ''}{item.customText && item.armband ? ' · ' : ''}{item.armband ? t('od.armband', { v: item.armband }) : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}><Price usd={item.priceUsd * item.qty} /></div>
            </div>
          ))}
        </div>

        {/* 金额汇总 */}
        <div style={{ marginTop: 14 }}>
          <div className="summary-row"><span className="muted">{t('cart.subtotal')}</span><b><Price usd={order.subtotalUsd || 0} /></b></div>
          {(order.discountUsd || 0) > 0 && (
            <div className="summary-row" style={{ color: 'var(--accent)' }}>
              <span>{t('checkout.multibuy')}</span><b>−<Price usd={order.discountUsd || 0} /></b>
            </div>
          )}
          <div className="summary-row">
            <span className="muted">{t('od.shipping')}</span><span>{(order.shippingUsd || 0) === 0 ? t('checkout.free') : <Price usd={order.shippingUsd || 0} />}</span>
          </div>
          <div className="summary-row total"><span>{t('checkout.total')}</span><b><Price usd={order.totalUsd} /></b></div>
        </div>

        {/* 收货地址 */}
        <div className="pdp-block" style={{ marginTop: 16 }}>
          <span className="eyebrow">{t('od.ship_addr')}</span>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            {order.name || customerName || '—'}<br />
            {order.address}{order.address ? <br /> : null}
            {[order.city, order.zip].filter(Boolean).join(', ')}{order.city || order.zip ? <br /> : null}
            {order.country}
          </p>
        </div>
      </section>

      {/* 物流：单号 + 完整轨迹 + 承运商直达 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <span className="eyebrow">{t('od.shipment')}</span>
        {shipment ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>
                {shipment.carrier || t('od.carrier')} · <span style={{ letterSpacing: '0.04em', color: 'var(--text-2)' }}>{shipment.trackingNo}</span>
              </span>
              <a
                href={carrierTrackingUrl(shipment.carrier, shipment.trackingNo)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-more"
                style={{ marginLeft: 'auto' }}
              >
                {t('od.track_on_17')}
              </a>
            </div>
            <TrackEvents events={shipment.events} />
          </>
        ) : (
          <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-small)' }}>
            {order.paymentStatus === 'cod'
              ? t('od.note_cod')
              : order.paymentStatus === 'paid'
                ? t('od.note_paid')
                : t('od.note_await')}
          </p>
        )}
      </section>
    </>
  );
}
