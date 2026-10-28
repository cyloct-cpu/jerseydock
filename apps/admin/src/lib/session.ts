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

/**
 * ⚠️ 不要把这里的 Uint8Array 转成 ArrayBuffer（u8.buffer.slice）再传给 subtle.verify：
 * Next 的 Edge 沙箱里跨 realm 的 ArrayBuffer 会过不了 node v22 SubtleCrypto 的类型检查
 * （TypeError: 3rd argument is not instance of ArrayBuffer...），Uint8Array 本体则两端通用。
 * TS 的 BufferSource 泛型差异用类型断言解决即可。
 */
function asBufferSource(u8: Uint8Array): BufferSource {
  return u8 as unknown as BufferSource;
}

export async function verifySessionEdge(token: string): Promise<{ sub: string; exp: number } | null> {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const key = await crypto.subtle.importKey('raw', asBufferSource(new TextEncoder().encode(secret())), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, asBufferSource(b64urlToBytes(sig)), asBufferSource(new TextEncoder().encode(payload)));
    if (!ok) return null;
    const data = JSON.parse(b64urlDecode(payload)) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp < Date.now()) return null;
    return { sub: String(data.sub), exp: Number(data.exp) };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE as SESSION_COOKIE_NAME };
