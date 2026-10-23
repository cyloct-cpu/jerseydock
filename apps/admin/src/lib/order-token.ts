import crypto from 'node:crypto';

/**
 * 游客订单链接签名（链接即凭证，免登录查看订单详情 + 物流轨迹 + 退款入口）
 * - token = HMAC-SHA256(secret, "guest-order:<orderNo>")，不可伪造
 * - 持有链接即视为收件人本人（等同知道单号+邮箱），泄露面与旧查单方案一致
 * - 仅服务端使用
 */
function secret(): string {
  return process.env.WEB_SESSION_SECRET || 'kitvault-dev-web-secret-change-me';
}

export function signGuestOrderToken(orderNo: string): string {
  return crypto.createHmac('sha256', secret()).update('guest-order:' + orderNo).digest('base64url');
}

export function verifyGuestOrderToken(orderNo: string, token: string): boolean {
  const expect = Buffer.from(signGuestOrderToken(orderNo));
  const got = Buffer.from(String(token || ''));
  return expect.length === got.length && crypto.timingSafeEqual(expect, got);
}

/** 游客订单详情页路径（带签名） */
export function guestOrderPath(orderNo: string): string {
  return `/orders/guest/${encodeURIComponent(orderNo)}?t=${signGuestOrderToken(orderNo)}`;
}
