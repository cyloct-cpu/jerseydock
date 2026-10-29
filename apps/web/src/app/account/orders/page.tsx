import Link from 'next/link';
import { getSessionUserFull } from '@/lib/users';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';
import { Price } from '@/components/Price';
import { T } from '@/components/ContentT9n';
import { FULFILLMENT_LABEL } from '@/lib/shipping';
import { dbReadOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

type StoredOrder = {
  orderNo: string;
  email: string;
  totalUsd: number;
  createdAt: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  shipment?: { carrier: string; trackingNo: string; status?: string; events?: { time: string; location: string; description: string }[] };
  items?: { title: string; qty: number; size: string; image?: string; handle?: string; customText?: string; armband?: string }[];
};

function readOrdersByEmail(email: string): StoredOrder[] {
  try {
    return dbReadOrders()
      .filter((o): o is StoredOrder => o !== null && String(o.email ?? '').toLowerCase() === email.toLowerCase())
      .reverse() as StoredOrder[];
  } catch {
    return [];
  }
}

export default async function AccountOrdersPage() {
  const user = await getSessionUserFull();
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  if (!user) return null; // layout 已做登录守卫
  const orders = readOrdersByEmail(user.email);

  return (
    <>
      <div className="page-head" style={{ padding: 0, marginBottom: 20 }}>
        <div>
          <span className="eyebrow">{t('acct.title')} · {t('acct.nav_orders')}</span>
          <h1 style={{ marginTop: 6, fontSize: 'clamp(24px,3vw,34px)' }}><T k="acct.myorders" /></h1>
          <p className="dim" style={{ fontSize: 'var(--fs-small)', marginTop: 6 }}></p>
        </div>
      </div>

      <section className="panel panel-pad">
        {orders.length ? (
          <div style={{ marginTop: 4 }}>
            {orders.map(o => {
              const shipment = o.shipment?.trackingNo ? o.shipment : null;
              const statusKey = o.fulfillmentStatus || shipment?.status || 'unfulfilled';
              return (
                <div className="order-mini" key={o.orderNo} style={{ alignItems: 'flex-start' }}>
                  <div className="thumb" style={{ width: 56, height: 70, flex: '0 0 auto' }}>
                    {o.items?.[0]?.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={o.items[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'var(--text-3)', fontSize: 10 }}>KIT</div>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/account/orders/${encodeURIComponent(o.orderNo)}`} style={{ color: 'var(--text)' }}>{o.orderNo}</Link>
                    <div className="dim" style={{ fontSize: 'var(--fs-small)' }}>
                      {new Date(o.createdAt).toLocaleDateString('en-GB')}
                      {o.items?.length ? ` · {t('acct.items_n').replace('{n}', String(o.items.reduce((s, i) => s + (i.qty || 0), 0)))}` : ''}
                    </div>
                    {o.items?.slice(0, 2).map((it, i) => (
                      <div key={i} className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 2 }}>
                        {it.title} · {it.size} ×{it.qty}
                        {(it.customText || it.armband) && <span style={{ color: 'var(--accent)' }}> · {t('cart.custom_tag')}</span>}
                      </div>
                    ))}
                    {o.items && o.items.length > 2 && (
                      <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>+{o.items.length - 2} more…</div>
                    )}
                    {o.paymentStatus && (
                      <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4, color: o.paymentStatus === 'paid' ? 'var(--accent)' : 'var(--text-3)' }}>
                        {['pending','paid','refunded','cancelled','cod'].includes(o.paymentStatus) ? t('pay.' + o.paymentStatus) : o.paymentStatus}
                      </div>
                    )}
                    {/* 物流一行摘要：状态 + 承运商 · 单号（完整轨迹在详情页） */}
                    {shipment && (
                      <div style={{ fontSize: 'var(--fs-micro)', marginTop: 4, color: 'var(--text-2)' }}>
                        <span className="tag on" style={{ marginRight: 6 }}>{FULFILLMENT_LABEL[statusKey] || statusKey}</span>
                        {shipment.carrier || t('od.carrier')} · {shipment.trackingNo}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                    <div><Price usd={o.totalUsd} /></div>
                    <Link className="link-more" href={`/account/orders/${encodeURIComponent(o.orderNo)}`}>
                      {shipment ? t('acct.details') : t('acct.view')}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <p className="muted">{t('acct.orders_empty')}</p>
            <p className="dim" style={{ marginTop: 8 }}>
              {t('acct.orders_hint_long').replace('{email}', user.email)}
            </p>
            <Link className="btn btn-ghost btn-sm" href="/collections/2026-27-season" style={{ marginTop: 14 }}>{t('acct.start_shopping')}</Link>
          </div>
        )}
      </section>
    </>
  );
}
