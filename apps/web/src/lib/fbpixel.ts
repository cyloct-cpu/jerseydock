/**
 * Meta (Facebook) Pixel 事件接线
 * 基码由 layout.tsx 注入（afterInteractive）；本模块只在已配置 Pixel ID 时转发浏览器侧行为事件。
 * 浏览器事件：ViewContent / AddToCart / InitiateCheckout（漏斗上层信号）。
 * Purchase 不在浏览器发（COD 下单≠成交）：服务端统一确认服务经 CAPI 回传，见 lib/purchase.ts / lib/capi.ts。
 */

export type FbEvent =
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout';

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
