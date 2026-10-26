import Link from 'next/link';
import { OrderDetailView } from '@/components/OrderDetailView';
import { verifyGuestOrderToken } from '@/lib/order-token';
import { loadBrand } from '@/lib/brand';
import { dbReadOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

type StoredOrder = {
  orderNo: string;
  email: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  zip?: string;
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

function readOrder(orderNo: string): StoredOrder | undefined {
  try {
    return dbReadOrders().find(o => o.orderNo.toUpperCase() === orderNo.toUpperCase()) as StoredOrder | undefined;
  } catch {
    return undefined;
  }
}

/**
 * 游客订单详情（签名链接即凭证，替代已下线的免注册查单页）
 * 链接在下单成功页 / 支付回跳页发放；后台绑定物流后，客户打开此链接即可看单号与轨迹，并可发起售后。
 */
export default async function GuestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNo } = await params;
  const { t: token = '' } = await searchParams;
  const brand = loadBrand();

  const order = readOrder(orderNo);
  const valid = !!order && verifyGuestOrderToken(orderNo, token);

  if (!valid) {
    return (
      <div className="container" style={{ paddingBlock: '80px 160px', maxWidth: 720 }}>
        <span className="eyebrow">Orders</span>
        <h1 className="h2" style={{ fontSize: 'clamp(24px,3vw,34px)', margin: '10px 0 14px' }}>Link not valid</h1>
        <p className="muted">
          This order link is invalid or incomplete. Please use the exact link from your checkout
          confirmation, or contact us and we will resend it.
        </p>
        <Link className="btn btn-ghost btn-sm" href="/" style={{ marginTop: 16 }}>Back to the store</Link>
      </div>
    );
  }

  return (
    <OrderDetailView
      order={order!}
      breadcrumb={[{ href: '/', label: 'Order' }]}
      whatsapp={brand.whatsapp || ''}
      supportEmail={brand.supportEmail || ''}
    />
  );
}
