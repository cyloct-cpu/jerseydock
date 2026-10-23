/**
 * 指标与客户档案聚合（需求 N9 CRM 数据基础）
 * 数据源：data/events.logl（埋点）+ data/orders.jsonl（订单）+ data/contacts.jsonl（留联系方式）
 */

export type Event = {
  type: string;
  handle?: string;
  size?: string;
  durationMs?: number;
  email?: string;
  visitorId?: string;
  currency?: string;
  locale?: string;
  ts: string;
  meta?: Record<string, unknown>;
};

export type Order = {
  orderNo: string;
  email: string;
  name?: string;
  address?: { fullName?: string; line1?: string; line2?: string; city?: string; region?: string; postcode?: string; country?: string; phone?: string };
  items: {
    handle: string;
    title: string;
    priceUsd: number;
    size: string;
    qty: number;
    image?: string;
    /** 定制：姓名 + 号码烫印 */
    customText?: string;
    /** 定制：袖章补丁名称 */
    armband?: string;
    /** 定制加价合计（USD） */
    customFeeUsd?: number;
  }[];
  subtotalUsd: number;
  discountUsd: number;
  shippingUsd: number;
  totalUsd: number;
  currency: string;
  paymentMethod?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shipment?: { carrier: string; trackingNo: string; status: string; events?: { time: string; location: string; description: string }[] };
  createdAt: string;
};

export type Contact = { name: string; email: string; orderNo?: string; message: string; ts: string };

export type CustomerProfile = {
  key: string;             // visitorId 或 email（优先 email）
  email: string;
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  viewCount: number;
  cartCount: number;
  checkoutStarts: number;
  topProducts: { handle: string; views: number }[];
  orderCount: number;
  ltvUsd: number;
  hasContact: boolean;
  contactType: string;
  currency: string;
  repeatBuyer: boolean;
  /** 前台账户资料回填（按 email 合并），回访直接联系用 */
  whatsapp?: string;
  phone?: string;
  /** 账户昵称（前台注册的显示名） */
  nickname?: string;
  /** 客户姓名：优先订单收件人姓名，其次账户昵称 */
  realName?: string;
  /** 账户注册时间 / 末次登录时间 */
  registeredAt?: string;
  lastLoginAt?: string;
  /** 已支付总金额：仅统计 paymentStatus=paid 的订单（货到付款标记已支付后计入） */
  paidUsd: number;
  /** 退款次数 / 退款金额（paymentStatus=refunded 的订单） */
  refundCount: number;
  refundUsd: number;
};

/** 前台注册用户资料（data/users.jsonl 中与客户档案相关的字段） */
export type WebUserContact = {
  email: string;
  name?: string;
  phone?: string;
  whatsapp?: string;
  createdAt?: string;
  lastLoginAt?: string;
};

const DAY = 864e5;

export function isSameDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export function buildCustomers(events: Event[], orders: Order[], contacts: Contact[], users: WebUserContact[] = []): CustomerProfile[] {
  const profiles = new Map<string, CustomerProfile & { views: Map<string, number> }>();

  const ensure = (key: string, email: string): CustomerProfile & { views: Map<string, number> } => {
    let p = profiles.get(key);
    if (!p) {
      p = {
        key,
        email,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: '',
        eventCount: 0,
        viewCount: 0,
        cartCount: 0,
        checkoutStarts: 0,
        topProducts: [],
        orderCount: 0,
        ltvUsd: 0,
        paidUsd: 0,
        refundCount: 0,
        refundUsd: 0,
        hasContact: false,
        contactType: '',
        currency: 'USD',
        repeatBuyer: false,
        views: new Map(),
      };
      profiles.set(key, p);
    }
    return p;
  };

  for (const ev of events) {
    const key = ev.email?.toLowerCase() || ev.visitorId || 'anon';
    const p = ensure(key, (ev.email || '').toLowerCase());
    p.eventCount++;
    if (!p.firstSeenAt || ev.ts < p.firstSeenAt) p.firstSeenAt = ev.ts;
    if (ev.ts > p.lastSeenAt) p.lastSeenAt = ev.ts;
    if (ev.currency) p.currency = ev.currency;
    if (ev.type === 'view_product' && ev.handle) {
      p.viewCount++;
      p.views.set(ev.handle, (p.views.get(ev.handle) || 0) + 1);
    }
    if (ev.type === 'add_to_cart') p.cartCount++;
    if (ev.type === 'checkout_start') p.checkoutStarts++;
  }

  // 有邮箱的埋点与订单按 email 合并
  for (const o of orders) {
    const email = (o.email || '').toLowerCase();
    if (!email) continue;
    const p = ensure(email, email);
    p.orderCount++;
    p.ltvUsd += Number(o.totalUsd) || 0;
    // 已支付总金额：仅直接支付（已付款）计入；货到付款在后台标记已支付后计入
    if (o.paymentStatus === 'paid') p.paidUsd += Number(o.totalUsd) || 0;
    // 退款记录：每笔退款订单累计次数与金额
    if (o.paymentStatus === 'refunded') {
      p.refundCount++;
      p.refundUsd += Number(o.totalUsd) || 0;
    }
    if (!p.realName && o.name) p.realName = o.name;
    if (o.createdAt < p.firstSeenAt) p.firstSeenAt = o.createdAt;
    if (o.createdAt > p.lastSeenAt) p.lastSeenAt = o.createdAt;
  }
  // visitor 档案若带 email 且与订单 email 相同 → 合并（订单档案胜出）
  const byEmail = new Map<string, CustomerProfile & { views: Map<string, number> }>();
  for (const p of profiles.values()) if (p.email) byEmail.set(p.email, p);
  for (const o of orders) {
    const email = (o.email || '').toLowerCase();
    const visitorKeys = [...profiles.keys()].filter(k => profiles.get(k)!.email === email && k !== email);
    for (const vk of visitorKeys) {
      const vp = profiles.get(vk)!;
      const ep = byEmail.get(email)!;
      ep.viewCount += vp.viewCount;
      ep.cartCount += vp.cartCount;
      ep.checkoutStarts += vp.checkoutStarts;
      ep.eventCount += vp.eventCount;
      for (const [h, n] of vp.views) ep.views.set(h, (ep.views.get(h) || 0) + n);
      if (vp.firstSeenAt < ep.firstSeenAt) ep.firstSeenAt = vp.firstSeenAt;
      if (vp.lastSeenAt > ep.lastSeenAt) ep.lastSeenAt = vp.lastSeenAt;
      profiles.delete(vk);
    }
  }

  for (const c of contacts) {
    const email = (c.email || '').toLowerCase();
    if (!email) continue;
    const p = ensure(email, email);
    p.hasContact = true;
    p.contactType = p.contactType || 'email';
  }

  // 前台账户资料按 email 回填：WhatsApp / 电话（留了 WhatsApp 即视为已留联系方式）
  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    if (!email) continue;
    const p = ensure(email, email);
    if (u.whatsapp) {
      p.whatsapp = u.whatsapp;
      p.hasContact = true;
      p.contactType = 'whatsapp';
    }
    if (u.phone) p.phone = u.phone;
    if (u.name) {
      p.nickname = u.name;
      if (!p.realName) p.realName = u.name;
    }
    if (u.createdAt) p.registeredAt = u.createdAt;
    if (u.lastLoginAt) p.lastLoginAt = u.lastLoginAt;
  }

  const list = [...profiles.values()].map(p => ({
    ...p,
    topProducts: [...p.views.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([handle, views]) => ({ handle, views })),
    repeatBuyer: p.orderCount >= 2,
    ltvUsd: Math.round(p.ltvUsd * 100) / 100,
    paidUsd: Math.round(p.paidUsd * 100) / 100,
    refundCount: p.refundCount,
    refundUsd: Math.round(p.refundUsd * 100) / 100,
  }));
  // 去掉 views Map
  return list.map(({ views: _views, ...rest }) => rest as CustomerProfile).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

export type Metrics = {
  ordersTotal: number;
  ordersToday: number;
  pendingPayment: number;
  unshipped: number;
  shipped: number;
  delivered: number;
  revenueUsd: number;
  revenueTodayUsd: number;
  avgOrderUsd: number;
  eventsToday: number;
  newContactsToday: number;
  followupsDue: number;
  followupsOverdue: number;
  activeProducts: number;
  draftProducts: number;
};

export function computeMetrics(
  orders: Order[],
  events: Event[],
  contacts: Contact[],
  followups: { status: string; nextAt?: string | null }[],
  productCounts: { active: number; draft: number }
): Metrics {
  const paid = (o: Order) => o.paymentStatus !== 'refunded' && o.paymentStatus !== 'failed';
  const revenueUsd = orders.filter(paid).reduce((s, o) => s + (Number(o.totalUsd) || 0), 0);
  const now = Date.now();
  return {
    ordersTotal: orders.length,
    ordersToday: orders.filter(o => isSameDay(o.createdAt)).length,
    pendingPayment: orders.filter(o => o.paymentStatus === 'pending').length,
    unshipped: orders.filter(o => ['unfulfilled', 'packing'].includes(o.fulfillmentStatus)).length,
    shipped: orders.filter(o => ['shipped', 'in_transit'].includes(o.fulfillmentStatus)).length,
    delivered: orders.filter(o => o.fulfillmentStatus === 'delivered').length,
    revenueUsd: Math.round(revenueUsd * 100) / 100,
    revenueTodayUsd: Math.round(orders.filter(paid).filter(o => isSameDay(o.createdAt)).reduce((s, o) => s + (Number(o.totalUsd) || 0), 0) * 100) / 100,
    avgOrderUsd: orders.length ? Math.round((revenueUsd / orders.length) * 100) / 100 : 0,
    eventsToday: events.filter(e => isSameDay(e.ts)).length,
    newContactsToday: contacts.filter(c => isSameDay(c.ts)).length,
    followupsDue: followups.filter(f => f.status === 'pending' && f.nextAt && new Date(f.nextAt).getTime() <= now + DAY).length,
    followupsOverdue: followups.filter(f => f.status === 'pending' && f.nextAt && new Date(f.nextAt).getTime() < now).length,
    activeProducts: productCounts.active,
    draftProducts: productCounts.draft,
  };
}

export function fmtUsd(n: number): string {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export function fmtTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}
