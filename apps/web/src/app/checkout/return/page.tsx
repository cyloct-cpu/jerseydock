import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { loadPaymentSettings, markOrderPaid } from '@/lib/payment';
import { getSessionUserFull } from '@/lib/users';
import { guestOrderPath } from '@/lib/order-token';
import { PayPalProvider } from '@kitvault/shared';

export const metadata: Metadata = { title: 'Payment' };
export const dynamic = 'force-dynamic';

/**
 * 支付回跳落地页
 * - Stripe：URL 带 session_id → 服务端拉取 Checkout Session 核对支付状态
 * - PayPal：URL 带 token（订单 ID）→ 服务端执行 capture
 * 核对为「已支付」即落库标记（幂等），并展示成功态；未完成则展示待确认态。
 */
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ orderNo?: string; session_id?: string; token?: string }>;
}) {
  const sp = await searchParams;
  const orderNo = (sp.orderNo || '').trim();

  // 查单页需要邮箱做归属校验：从订单记录取下单邮箱
  function orderEmail(no: string): string {
    try {
      const log = path.resolve(process.cwd(), '..', '..', 'data', 'orders.jsonl');
      return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l) as { orderNo?: string; email?: string }; } catch { return null; } })
        .find(o => o?.orderNo?.toUpperCase() === no.toUpperCase())?.email || '';
    } catch { return ''; }
  }
  const email = orderEmail(orderNo);
  const user = await getSessionUserFull();
  const guestPath = orderNo ? guestOrderPath(orderNo) : '';
  const settings = loadPaymentSettings();

  let paid = false;
  let reference = '';
  let checking = true;

  if (orderNo) {
    if (sp.session_id && settings.provider === 'stripe' && settings.stripe.secretKey) {
      // Stripe：拉取 session 核对（不信任前端回跳参数）
      try {
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sp.session_id)}`, {
          headers: { Authorization: `Bearer ${settings.stripe.secretKey}` },
        });
        const session = await res.json();
        if (res.ok && session.payment_status === 'paid') {
          paid = true;
          reference = String(session.id ?? '');
        }
      } catch { /* 网络异常按未完成处理，webhook 仍会兜底 */ }
    } else if (sp.token && settings.provider === 'paypal' && settings.paypal.clientId) {
      // PayPal：回跳后 capture
      const provider = new PayPalProvider(settings.paypal);
      const result = await provider.capture(sp.token);
      if (result.paid) {
        paid = true;
        reference = result.reference || '';
      }
    }
    if (paid) markOrderPaid(orderNo, reference);
    checking = false;
  }

  return (
    <div className="container" style={{ paddingBlock: '100px 170px' }}>
      <div className="panel panel-pad success-panel">
        <span className="eyebrow" style={{ color: paid ? 'var(--accent)' : undefined }}>
          {paid ? 'Payment received' : orderNo ? 'Payment pending' : 'Payment'}
        </span>
        <h1 className="h2" style={{ margin: '12px 0 14px', fontSize: 'clamp(24px,3vw,36px)' }}>
          {paid ? `Thank you — ${orderNo}` : orderNo ? `Order ${orderNo} — awaiting confirmation` : 'Payment status'}
        </h1>
        <p className="muted" style={{ maxWidth: '52ch', margin: '0 auto' }}>
          {paid
            ? 'Your payment has been confirmed. We are preparing your parcel — a tracking number will appear on the order page once shipped.'
            : checking
              ? 'No order reference was provided.'
              : 'We have not received a payment confirmation yet. If you completed the payment, this page updates automatically within a few minutes — our team will confirm by email shortly.'}
        </p>
        {orderNo && (
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn" href={user ? `/account/orders/${encodeURIComponent(orderNo)}` : guestPath}>View order</Link>
            <Link className="btn btn-ghost" href="/collections/2026-27-season">Continue shopping</Link>
          </div>
        )}
        {!orderNo && (
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn" href="/collections/2026-27-season">Continue shopping</Link>
          </div>
        )}
      </div>
    </div>
  );
}
