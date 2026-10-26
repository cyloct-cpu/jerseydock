import { notFound } from 'next/navigation';
import { getSessionUserFull } from '@/lib/users';
import { OrderDetailView } from '@/components/OrderDetailView';
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
  currency?: string;
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

function readOrder(orderNo: string): StoredOrder | undefined {
  try {
    return dbReadOrders().find(o => o.orderNo.toUpperCase() === orderNo.toUpperCase()) as StoredOrder | undefined;
  } catch {
    return undefined;
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const user = await getSessionUserFull();
  if (!user) return null; // account layout 已做登录守卫

  const order = readOrder(orderNo);
  // 只能看自己的订单（邮箱归属校验）
  if (!order || order.email.toLowerCase() !== user.email.toLowerCase()) notFound();

  const brand = loadBrand();

  return (
    <OrderDetailView
      order={order}
      breadcrumb={[{ href: '/account/orders', label: 'My orders' }]}
      customerName={user.name}
      whatsapp={brand.whatsapp || ''}
      supportEmail={brand.supportEmail || ''}
    />
  );
}
