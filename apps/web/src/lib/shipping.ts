/**
 * 物流展示共用工具（前台账户页 / 查单页共用）
 * 履约状态值与后台一致：unfulfilled / packing / shipped / in_transit / delivered / exception
 */
export const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: 'Preparing',
  packing: 'Packing',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
  exception: 'Delivery exception',
};

/** 承运商 → 官方查询链接（默认 17TRACK，支持聚合查询多数线路） */
export function carrierTrackingUrl(carrier: string, trackingNo: string): string {
  if (/dhl/i.test(carrier)) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNo)}`;
  }
  if (/fedex/i.test(carrier)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNo)}`;
  }
  if (/ups/i.test(carrier)) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNo)}`;
  }
  return `https://t.17track.net/en#nums=${encodeURIComponent(trackingNo)}`;
}
