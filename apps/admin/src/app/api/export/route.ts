import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { paths, readJsonl, writeCsv } from '@/lib/store';
import { buildCustomers, type Contact, type Event, type Order } from '@/lib/metrics';
import { moneyStateOf, payMethodLabel } from '@/lib/money-state';
import { can, verifySessionEdge, SESSION_COOKIE_NAME, readUserById } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** 导出 CSV（订单 / 客户 / 埋点）——同时留存到 data/exports/，需 data.export 权限 */
export async function GET(req: NextRequest) {
  // 路由层鉴权（middleware 已校验登录，此处再校验导出权限）
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  const user = session ? readUserById(session.sub) : null;
  if (!can(user, 'data.export')) {
    return NextResponse.json({ ok: false, error: '无权导出数据（缺少权限：data.export）' }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type') || 'orders';
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === 'orders') {
    const orders = readJsonl<Order>(paths.orders);
    const file = writeCsv(
      paths.exports + `/orders-${stamp}.csv`,
      ['orderNo', 'createdAt', 'email', 'name', 'phone', 'country', 'items', 'subtotalUsd', 'discountUsd', 'shippingUsd', 'totalUsd', 'currency', 'moneyState', 'moneyReason', 'payMethod', 'paymentStatus', 'fulfillmentStatus', 'carrier', 'trackingNo'],
      orders.map(o => [
        o.orderNo, o.createdAt, o.email, o.name || '', (o as unknown as { phone?: string }).phone || '',
        (o as unknown as { country?: string }).country || (o as unknown as { address?: { country?: string } }).address?.country || '',
        o.items.map(i => `${i.title}(${i.size})x${i.qty}`).join(' | '),
        o.subtotalUsd, o.discountUsd, o.shippingUsd, o.totalUsd, o.currency,
        (() => { const m = moneyStateOf(o as never); return m.label; })(), (() => { const m = moneyStateOf(o as never); return m.reason || ''; })(), payMethodLabel(o as never), o.paymentStatus, o.fulfillmentStatus, o.shipment?.carrier || '', o.shipment?.trackingNo || '',
      ])
    );
    return csvResponse(file, `orders-${stamp}.csv`);
  }

  if (type === 'customers') {
    const users = readJsonl<{ email: string; name?: string; whatsapp?: string; phone?: string; createdAt?: string; lastLoginAt?: string }>(paths.users);
    const customers = buildCustomers(readJsonl<Event>(paths.events), readJsonl<Order>(paths.orders), readJsonl<Contact>(paths.contacts), users);
    const file = writeCsv(
      paths.exports + `/customers-${stamp}.csv`,
      ['key', 'email', 'nickname', 'realName', 'phone', 'whatsapp', 'registeredAt', 'lastLoginAt', 'firstSeenAt', 'lastSeenAt', 'viewCount', 'cartCount', 'checkoutStarts', 'orderCount', 'repeatBuyer', 'ltvUsd', 'paidUsd', 'refundCount', 'refundUsd', 'hasContact', 'currency', 'topProduct'],
      customers.map(c => [c.key, c.email, c.nickname || '', c.realName || '', c.phone || '', c.whatsapp || '', c.registeredAt || '', c.lastLoginAt || '', c.firstSeenAt, c.lastSeenAt, c.viewCount, c.cartCount, c.checkoutStarts, c.orderCount, String(c.repeatBuyer), c.ltvUsd, c.paidUsd ?? 0, c.refundCount ?? 0, c.refundUsd ?? 0, String(c.hasContact), c.currency, c.topProducts[0]?.handle || ''])
    );
    return csvResponse(file, `customers-${stamp}.csv`);
  }

  if (type === 'events') {
    const events = readJsonl<Event>(paths.events);
    const file = writeCsv(
      paths.exports + `/events-${stamp}.csv`,
      ['ts', 'type', 'visitorId', 'email', 'handle', 'size', 'durationMs', 'currency', 'locale'],
      events.map(e => [e.ts, e.type, e.visitorId || '', e.email || '', e.handle || '', e.size || '', e.durationMs ?? '', e.currency || '', e.locale || ''])
    );
    return csvResponse(file, `events-${stamp}.csv`);
  }

  return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 });
}

function csvResponse(file: string, downloadName: string) {
  const body = fs.readFileSync(file);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    },
  });
}
