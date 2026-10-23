import Link from 'next/link';
import { Price } from './Price';
import { Breadcrumb } from './Breadcrumb';
import { TrackEvents } from './TrackEvents';
import { RefundButton } from './RefundButton';
import { carrierTrackingUrl, FULFILLMENT_LABEL } from '@/lib/shipping';

/**
 * 订单详情共享视图（服务端组件）
 * 登录订单详情页（/account/orders/[orderNo]）与游客签名链接页（/orders/guest/[orderNo]）共用：
 * 订单头 + 商品明细 + 金额 + 收货地址 + 物流（单号/轨迹/17TRACK 直达）+ 退款入口。
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

const PAYMENT_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  cod: 'Cash on delivery',
};

export function OrderDetailView({
  order,
  breadcrumb,
  customerName,
  whatsapp,
  supportEmail,
}: {
  order: OrderDetailOrder;
  /** 面包屑中段（如 My orders）；游客页可不传 */
  breadcrumb?: { href: string; label: string }[];
  customerName?: string;
  whatsapp: string;
  supportEmail: string;
}) {
  const shipment = order.shipment?.trackingNo ? order.shipment : null;
  const statusKey = order.fulfillmentStatus || shipment?.status || 'unfulfilled';
  const paymentLabel = PAYMENT_LABEL[order.paymentStatus || ''] || order.paymentStatus;

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
          <span className="eyebrow">Order</span>
          <h1 style={{ margin: '6px 0 4px', fontSize: 'clamp(22px,3vw,30px)' }}>{order.orderNo}</h1>
          <p className="dim" style={{ fontSize: 'var(--fs-small)' }}>
            Placed {new Date(order.createdAt).toLocaleString('en-GB')} · {order.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0} items
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`tag${order.paymentStatus === 'paid' ? ' on' : ''}`}>Payment: {paymentLabel}</span>
          <span className={`tag${statusKey === 'delivered' ? ' on' : ''}`}>{FULFILLMENT_LABEL[statusKey] || statusKey}</span>
          <RefundButton orderNo={order.orderNo} whatsapp={whatsapp} supportEmail={supportEmail} />
        </div>
      </div>

      {/* 商品明细 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <span className="eyebrow">Items</span>
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
                    {item.customText ? `Name + number: ${item.customText}` : ''}{item.customText && item.armband ? ' · ' : ''}{item.armband ? `Armband: ${item.armband}` : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}><Price usd={item.priceUsd * item.qty} /></div>
            </div>
          ))}
        </div>

        {/* 金额汇总 */}
        <div style={{ marginTop: 14 }}>
          <div className="summary-row"><span className="muted">Subtotal</span><b><Price usd={order.subtotalUsd || 0} /></b></div>
          {(order.discountUsd || 0) > 0 && (
            <div className="summary-row" style={{ color: 'var(--accent)' }}>
              <span>Multi-buy discount</span><b>−<Price usd={order.discountUsd || 0} /></b>
            </div>
          )}
          <div className="summary-row">
            <span className="muted">Shipping</span><span>{(order.shippingUsd || 0) === 0 ? 'Free' : <Price usd={order.shippingUsd || 0} />}</span>
          </div>
          <div className="summary-row total"><span>Total</span><b><Price usd={order.totalUsd} /></b></div>
        </div>

        {/* 收货地址 */}
        <div className="pdp-block" style={{ marginTop: 16 }}>
          <span className="eyebrow">Shipping address</span>
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
        <span className="eyebrow">Shipment</span>
        {shipment ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>
                {shipment.carrier || 'Carrier'} · <span style={{ letterSpacing: '0.04em', color: 'var(--text-2)' }}>{shipment.trackingNo}</span>
              </span>
              <a
                href={carrierTrackingUrl(shipment.carrier, shipment.trackingNo)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-more"
                style={{ marginLeft: 'auto' }}
              >
                Track on 17TRACK ↗
              </a>
            </div>
            <TrackEvents events={shipment.events} />
          </>
        ) : (
          <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-small)' }}>
            {order.paymentStatus === 'cod'
              ? 'Cash on delivery — you pay the courier when your parcel arrives. Your order is being prepared and a tracking number will appear here once shipped.'
              : order.paymentStatus === 'paid'
                ? 'Payment confirmed — your parcel is being prepared. A tracking number will appear here once shipped.'
                : 'Awaiting payment confirmation — shipping starts after our team confirms payment.'}
          </p>
        )}
      </section>
    </>
  );
}
