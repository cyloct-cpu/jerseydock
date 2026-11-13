/**
 * Meta (Facebook) Pixel 事件接线
 * 基码由 layout.tsx 注入（afterInteractive）；本模块只在已配置 Pixel ID 时转发标准电商事件。
 * 事件与自建埋点（lib/track.ts）并列：view_product→ViewContent、add_to_cart→AddToCart、
 * checkout_start→InitiateCheckout；Purchase 在下单成功页上报（CheckoutClient）。
 */

export type FbEvent =
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Purchase';

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: unknown };

/** window.fbq 是否已就绪（基码已加载且配置了 Pixel ID） */
function fbq(): Fbq | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { fbq?: Fbq };
  return typeof w.fbq === 'function' ? w.fbq : null;
}

/** 上报一条标准事件；value 为 USD 金额（前站像素计价与订单一致用 USD） */
export function fb(event: FbEvent, params?: Record<string, unknown>): void {
  const q = fbq();
  if (!q) return;
  try {
    q('track', event, params ?? {});
  } catch {}
}

export function fbViewContent(handle: string, title: string, valueUsd: number): void {
  fb('ViewContent', {
    content_ids: [handle],
    content_type: 'product',
    content_name: title,
    value: Number(valueUsd.toFixed(2)),
    currency: 'USD',
  });
}

export function fbAddToCart(valueUsd: number, qty: number): void {
  fb('AddToCart', {
    // content_ids 走 handle 数组（与目录同步/Advanced Matching 无关，够 FB 建受众用）
    content_type: 'product',
    value: Number(valueUsd.toFixed(2)),
    currency: 'USD',
    num_items: qty,
  });
}

export function fbInitiateCheckout(valueUsd: number, items: number): void {
  fb('InitiateCheckout', {
    value: Number(valueUsd.toFixed(2)),
    currency: 'USD',
    num_items: items,
  });
}

export function fbPurchase(valueUsd: number, orderNo: string, items: number): void {
  fb('Purchase', {
    value: Number(valueUsd.toFixed(2)),
    currency: 'USD',
    content_type: 'product',
    num_items: items,
    order_id: orderNo,
  });
}
