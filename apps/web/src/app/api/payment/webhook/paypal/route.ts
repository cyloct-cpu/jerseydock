import { NextRequest, NextResponse } from 'next/server';
import { loadPaymentSettings, markOrderPaid } from '@/lib/payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PayPal Webhook：POST /api/payment/webhook/paypal
 * 后台配置地址：https://<域名>/api/payment/webhook/paypal
 * 处理事件：PAYMENT.SALE.COMPLETED / CHECKOUT.ORDER.COMPLETED
 * 说明：配置了 webhookId 时调用 PayPal 官方验签接口；未配置则按事件内容处理（建议配置）。
 */
export async function POST(req: NextRequest) {
  const settings = loadPaymentSettings();
  const raw = await req.text();

  let event: {
    event_type?: string;
    resource?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // 官方验签（需要 PayPal 后台的 Webhook ID；未配置则跳过）
  if (settings.paypal.webhookId) {
    try {
      const auth = btoa(`${settings.paypal.clientId}:${settings.paypal.clientSecret}`);
      const tokenRes = await fetch(
        `${settings.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'}/v1/oauth2/token`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
        },
      );
      const tokenData = await tokenRes.json();
      const verifyRes = await fetch(
        `${settings.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auth_algo: req.headers.get('paypal-auth-algo'),
            cert_url: req.headers.get('paypal-cert-url'),
            transmission_id: req.headers.get('paypal-transmission-id'),
            transmission_sig: req.headers.get('paypal-transmission-sig'),
            transmission_time: req.headers.get('paypal-transmission-time'),
            webhook_id: settings.paypal.webhookId,
            event_body: raw,
          }),
        },
      );
      const verifyData = await verifyRes.json();
      if (verifyData.verification_status !== 'SUCCESS') {
        return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 400 });
    }
  }

  const resource = event.resource ?? {};
  if (event.event_type === 'PAYMENT.SALE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.COMPLETED') {
    // 订单号来源：custom_id / invoice_id（下单时写入），或父级关联
    const orderNo = String(resource.custom_id ?? resource.invoice_id ?? resource.invoice_number ?? '');
    const reference = String(resource.id ?? '');
    if (orderNo) markOrderPaid(orderNo, reference);
  }
  return NextResponse.json({ received: true });
}
