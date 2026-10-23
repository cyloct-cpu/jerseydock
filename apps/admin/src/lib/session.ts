/**
 * 会话校验（Edge 安全版）
 * middleware 运行在 Edge Runtime，不能用 node:crypto / node:fs —— 只允许 Web Crypto。
 * 与 lib/auth.ts 中的 signSession（node:crypto HMAC）算法一致：HMAC-SHA256(payload, secret)。
 */

const SESSION_COOKIE = 'kv_admin_session';

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || 'kitvault-dev-session-secret-change-me';
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
  return atob(b64 + pad);
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = b64urlDecode(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Web Crypto 的 BufferSource 在不同 TS lib 版本下对 Uint8Array 泛型要求不同，统一转成独立 ArrayBuffer */
function asBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function verifySessionEdge(token: string): Promise<{ sub: string; exp: number } | null> {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const key = await crypto.subtle.importKey('raw', asBuffer(new TextEncoder().encode(secret())), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, asBuffer(b64urlToBytes(sig)), asBuffer(new TextEncoder().encode(payload)));
    if (!ok) return null;
    const data = JSON.parse(b64urlDecode(payload)) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp < Date.now()) return null;
    return { sub: String(data.sub), exp: Number(data.exp) };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE as SESSION_COOKIE_NAME };
