/**
 * 前台埋点（需求 N9 数据基础）
 * 上报浏览商品 / 停留时长 / 加购 / 结算开始 / 留联系方式 / 回访。
 * 服务端写入 data/events.logl（JSON Lines），供后台 CRM 导入。
 */

export type EventType =
  | 'view_product'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'checkout_start'
  | 'contact_submit'
  | 'return_visit';

export type TrackPayload = {
  type: EventType;
  handle?: string;
  size?: string;
  durationMs?: number;
  email?: string;
  meta?: Record<string, unknown>;
};

let visitorId = '';
if (typeof window !== 'undefined') {
  try {
    visitorId = window.localStorage.getItem('kv_visitor') || '';
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      window.localStorage.setItem('kv_visitor', visitorId);
    }
  } catch {}
}

export function track(payload: TrackPayload): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    ...payload,
    visitorId,
    country: undefined,
    currency: window.localStorage.getItem('kv_currency'),
    locale: window.localStorage.getItem('kv_locale'),
    ts: new Date().toISOString(),
    referrer: document.referrer || undefined,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
    }
  } catch {}
}

/** 记录商品页停留时长 */
export function trackView(handle: string): () => void {
  const start = Date.now();
  track({ type: 'view_product', handle });
  return () => {
    const durationMs = Date.now() - start;
    if (durationMs > 1500) track({ type: 'view_product', handle, durationMs });
  };
}
