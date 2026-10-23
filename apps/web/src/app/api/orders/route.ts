import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { guestOrderPath } from '@/lib/order-token';
import path from 'node:path';
import { priceOrder } from '@/lib/pricing';
import { loadBrand } from '@/lib/brand';
import { allProducts } from '@/lib/catalog';

const ORDERS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'orders.jsonl');

function genOrderNo(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `KV-${t.slice(-4)}${r}`;
}

type IncomingItem = {
  handle: string;
  size: string;
  qty: number;
  /** 定制：姓名 + 号码烫印 */
  customText?: string;
  /** 定制：袖章补丁名称 */
  armband?: string;
};

/**
 * 创建订单（需求 N2 / N8）
 * - 服务端按商品表重新核价，不信任客户端提交的价格
 * - 支付未开通：订单创建为 paymentStatus=pending，由后台人工确认
 * - 落盘 data/orders.jsonl（JSON Lines，与后台共用）
 */
export async function POST(req: NextRequest) {
  let body: {
    items?: IncomingItem[];
    email?: string;
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    zip?: string;
    currency?: string;
    /** 支付方式：cod=货到付款（默认）；online=在线支付（通道未开通时等同待支付） */
    paymentMethod?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { email, name, address, city, country, zip, currency } = body;
  const phone = String(body.phone || '').trim();
  const paymentMethod = body.paymentMethod === 'online' ? 'online' : body.paymentMethod === 'transfer' ? 'transfer' : 'cod';
  const items = Array.isArray(body.items) ? body.items : [];

  if (!items.length) {
    return NextResponse.json({ ok: false, error: 'Your cart is empty' }, { status: 400 });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 });
  }
  if (!name || !address || !city || !country || !zip) {
    return NextResponse.json({ ok: false, error: 'Please complete the shipping address' }, { status: 400 });
  }
  // 电话为物流预报必填项（OMS consignee_telephone），缺失会导致无法交运
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'A phone number is required for delivery' }, { status: 400 });
  }

  try {
    // 服务端核价 + 尺码校验（非法尺码回退到商品首个尺码）
    // 商品表用 allProducts()：含后台导入商品与改价覆盖，不信任客户端价格
    // 定制加价同样服务端计算：烫印固定加价；补丁按后台配置的选项价计，非法选项不计价
    const { customize } = loadBrand();
    const catalog = allProducts();
    const lines = items.map(it => {
      const p = catalog.find(x => x.h === it.handle);
      if (!p) throw new Error(`Unknown product: ${it.handle}`);
      const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
      const size = p.s.includes(it.size) ? it.size : p.s[0] || 'M';

      // 定制：姓名 + 号码（清洗后最多 maxLength 字符）
      let customText: string | undefined;
      if (customize.enabled && customize.nameNumber.enabled && typeof it.customText === 'string') {
        const text = it.customText.trim().slice(0, customize.nameNumber.maxLength);
        if (text) customText = text;
      }
      // 定制：袖章补丁（仅认后台配置中的选项名，防篡改加价）
      let armband: string | undefined;
      let extraUsd = 0;
      if (customize.enabled && customize.armband.enabled && typeof it.armband === 'string') {
        const label = it.armband.trim();
        const opt = customize.armband.options.find(o => o.label === label);
        if (opt) {
          armband = opt.label;
          extraUsd += opt.price;
        }
      }
      if (customText) extraUsd += customize.nameNumber.price;

      const priceUsd = Math.round((p.p + extraUsd) * 100) / 100;
      return {
        handle: p.h,
        title: p.t,
        priceUsd,
        size,
        qty,
        image: p.v || p.i[0] || '',
        ...(customText ? { customText } : {}),
        ...(armband ? { armband } : {}),
        ...(extraUsd > 0 ? { customFeeUsd: extraUsd } : {}),
      };
    });

    const subtotalUsd = Math.round(lines.reduce((s, l) => s + l.priceUsd * l.qty, 0) * 100) / 100;
    const itemCount = lines.reduce((s, l) => s + l.qty, 0);
    const pricing = priceOrder(subtotalUsd, itemCount);

    const order = {
      orderNo: genOrderNo(),
      email,
      name,
      phone,
      address,
      city,
      country,
      zip,
      currency: currency || 'USD',
      items: lines,
      subtotalUsd: pricing.subtotalUsd,
      discountUsd: pricing.discountUsd,
      shippingUsd: pricing.shippingUsd,
      totalUsd: pricing.totalUsd,
      // 货到付款：cod（送达时现金结算）；在线支付通道未开通：pending（人工确认收款）
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'cod' : 'pending',
      fulfillmentStatus: 'unfulfilled',
      shipment: { carrier: '', trackingNo: '', status: 'pending', events: [] },
      createdAt: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(ORDERS_LOG), { recursive: true });
    fs.appendFileSync(ORDERS_LOG, JSON.stringify(order) + '\n', 'utf8');

    // 货到付款：下单即入 OMS 推送队列（后台 worker 消费）；在线/转账：支付确认后入队（payment.ts / 后台标记已支付）
    if (paymentMethod === 'cod') {
      try {
        const { enqueueOmsPush } = await import('@/lib/oms-queue');
        enqueueOmsPush(order.orderNo);
      } catch { /* 入队失败不阻塞下单，后台可手动推送 */ }
    }

    return NextResponse.json({
      ok: true,
      orderNo: order.orderNo,
      guestUrl: guestOrderPath(order.orderNo),
      subtotalUsd: order.subtotalUsd,
      discountUsd: order.discountUsd,
      shippingUsd: order.shippingUsd,
      totalUsd: order.totalUsd,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Could not create order' },
      { status: 400 }
    );
  }
}
