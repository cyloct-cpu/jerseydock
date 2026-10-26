import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadPaymentSettings, markOrderPaid } from '@/lib/payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stripe Webhook 签名验签（v1，容差 5 分钟） */
function verifyStripeSig(rawBody: string, sigHeader: string, secret: string): boolean {
  const parts = sigHeader.split(',').map(p => p.trim());
  let t = '';
  const v1: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 't') t = v;
    if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const ok = v1.some(sig => {
    try {
      return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
  // 重放攻击容差：5 分钟
  return ok && Math.abs(Date.now() / 1000 - Number(t)) <= 300;
}

/**
 * Stripe Webhook：POST /api/payment/webhook/stripe
 * 后台配置地址：https://<域名>/api/payment/webhook/stripe
 * 监听事件：checkout.session.completed
 */
export async function POST(req: NextRequest) {
  const settings = loadPaymentSettings();
  const secret = settings.stripe.webhookSecret;
  const raw = await req.text();

  if (!secret) {
    // 未配置 webhook 密钥时一律拒绝：验签是回调唯一身份凭据，跳过等于开放伪造置单
    console.error('[stripe-webhook] rejected: Stripe webhookSecret not configured');
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 400 });
  }
  const sig = req.headers.get('stripe-signature') || '';
  if (!verifyStripeSig(raw, sig, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object ?? {};
    // 支付成功才回写；未完成（如异步方式）等后续事件
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const metadata = (session.metadata ?? {}) as Record<string, unknown>;
      const orderNo = String(metadata.order_no ?? session.client_reference_id ?? '');
      if (orderNo) markOrderPaid(orderNo, String(session.id ?? ''));
    }
  }
  // 其他事件一律 200 确认收到（避免 Stripe 重试风暴）
  return NextResponse.json({ received: true });
}
