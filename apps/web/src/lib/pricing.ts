/**
 * 订单定价规则（前台预览与 /api/orders 共用同一套规则，避免两边算错）
 * 规则与站点公告一致：满 3 件减 $5、满 8 件减 $10；满 3 件免运费，否则 flat $6.90。
 * 价格一律 USD 基准；展示币种由前端换算，订单内记录 currency 快照。
 */

export const FREE_SHIPPING_MIN_ITEMS = 3;
export const FLAT_SHIPPING_USD = 6.9;

export const DISCOUNT_TIERS = [
  { minItems: 8, offUsd: 10 },
  { minItems: 3, offUsd: 5 },
] as const;

export type OrderPricing = {
  subtotalUsd: number;
  discountUsd: number;
  shippingUsd: number;
  totalUsd: number;
};

export function priceOrder(subtotalUsd: number, itemCount: number): OrderPricing {
  const tier = DISCOUNT_TIERS.find(t => itemCount >= t.minItems);
  const discountUsd = tier ? tier.offUsd : 0;
  const shippingUsd = itemCount >= FREE_SHIPPING_MIN_ITEMS ? 0 : FLAT_SHIPPING_USD;
  const totalUsd = Math.max(0, Math.round((subtotalUsd - discountUsd + shippingUsd) * 100) / 100);
  return { subtotalUsd, discountUsd, shippingUsd, totalUsd };
}
