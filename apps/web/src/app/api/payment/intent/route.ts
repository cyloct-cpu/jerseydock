import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider, readOrders } from '@/lib/payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 创建支付会话：POST /api/payment/intent  body: { orderNo }
 * - 订单必须存在且金额以服务端订单为准（不信任客户端传价）
 * - 通道未配置密钥时返回 { status: 'unavailable' }（前端回落「待支付」说明）
 * - Stripe / PayPal 返回 { status: 'redirect', url }，前端跳转托管收银台
 */
export async function POST(req: NextRequest) {
  let orderNo = '';
  try {
    const body = await req.json();
    orderNo = String(body?.orderNo || '').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
  if (!orderNo) return NextResponse.json({ ok: false, error: 'Missing orderNo' }, { status: 400 });

  // 服务端按订单号重新取金额（防篡改）
  const order = readOrders().find(o => String(o.orderNo).toUpperCase() === orderNo.toUpperCase());
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  if (order.paymentStatus === 'paid') {
    return NextResponse.json({ ok: true, status: 'ok', reference: 'already-paid' });
  }

  const provider = getPaymentProvider();
  const result = await provider.createIntent({
    orderNo: order.orderNo,
    amountUsd: Number(order.totalUsd) || 0,
    currency: 'USD',
    email: String(order.email || ''),
    origin: new URL(req.url).origin,
  });

  if (result.status === 'redirect') {
    return NextResponse.json({ ok: true, status: 'redirect', url: result.url });
  }
  if (result.status === 'ok') {
    return NextResponse.json({ ok: true, status: 'ok', reference: result.reference });
  }
  return NextResponse.json({ ok: false, status: 'unavailable', error: result.message }, { status: 409 });
}
