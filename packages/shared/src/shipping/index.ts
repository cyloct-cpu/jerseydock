/**
 * 物流 Provider（需求 N2）
 * 当前免费方案：后台手工/CSV 导入单号；前台生成承运商官方查询直链跳转。
 * 后续可接 AfterShip / 17TRACK：实现同一接口即可。
 */

export type TrackingStatus = 'pending' | 'in_transit' | 'delivered' | 'exception';

export type TrackingEvent = { time: string; location: string; description: string };

export interface ShippingProvider {
  readonly id: string;
  /** 生成公开查询直链（免费、零对接） */
  publicUrl(trackingNo: string, carrier: string): string;
  /** 拉取轨迹；手工方案返回 null，由后台维护 */
  fetchTracking(trackingNo: string, carrier: string): Promise<TrackingEvent[] | null>;
}

/** 免费方案：17TRACK / parcelsapp 直链跳转 */
export class LinkBasedShipping implements ShippingProvider {
  readonly id = 'link-based';
  publicUrl(trackingNo: string, carrier: string): string {
    const q = encodeURIComponent(trackingNo);
    if (/dhl/i.test(carrier)) return `https://www.dhl.com/en/express/tracking.html?AWB=${q}`;
    if (/fedex/i.test(carrier)) return `https://www.fedex.com/fedextrack/?trknbr=${q}`;
    if (/ups/i.test(carrier)) return `https://www.ups.com/track?tracknum=${q}`;
    if (/yunexpress|4px|yanwen/i.test(carrier)) return `https://t.17track.net/en#nums=${q}`;
    return `https://t.17track.net/en#nums=${q}`;
  }
  async fetchTracking(): Promise<TrackingEvent[] | null> {
    return null; // 轨迹由后台手工维护
  }
}

export const shippingProvider: ShippingProvider = new LinkBasedShipping();

/** 预留：AfterShip 实现（后续接入，需 API key）
export class AfterShipShipping implements ShippingProvider { ... }
*/
