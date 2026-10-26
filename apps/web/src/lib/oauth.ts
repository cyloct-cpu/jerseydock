import crypto from 'node:crypto';
import fs from 'node:fs';
import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  createUser,
  findUserByEmail,
  sessionCookieOptions,
  signSession,
  touchLogin,
} from './users';

/**
 * 第三方登录（OAuth）：Google 可用 / Apple 需开发者账号
 * 点击按钮 → /api/auth/{provider}/start 跳授权页 → 回调交换 token
 * → 按邮箱找号或自动建号（随机不可猜密码，等同于免密账号）→ 落会话 cookie
 */

export const STATE_COOKIE = 'kv_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_SERVICES_ID && process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID && appleKeyPem(),
  );
}

/** 安全校验：只允许站内路径，防开放跳转 */
export function safeNext(raw: unknown): string {
  const n = String(raw ?? '').trim();
  return n.startsWith('/') && !n.startsWith('//') ? n : '/account';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

// ---------------- state（CSRF 防护） ----------------

type StatePayload = { p: 'google' | 'apple'; n: string; next: string; exp: number };

export async function writeStateCookie(provider: 'google' | 'apple', next: string): Promise<string> {
  const state: StatePayload = { p: provider, n: crypto.randomBytes(16).toString('hex'), next, exp: Date.now() + STATE_TTL_MS };
  const store = await cookies();
  store.set(STATE_COOKIE, b64url(Buffer.from(JSON.stringify(state))), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: STATE_TTL_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  });
  return `${b64url(Buffer.from(state.n))}.${b64url(Buffer.from(next))}`;
}

/** 校验 state（provider 必须一致、nonce 必须与 cookie 内记录一致、未过期）；返回 next 与 nonce（nonce 需与 id_token 回传值比对） */
export async function verifyStateCookie(provider: 'google' | 'apple', stateParam: string | null): Promise<{ next: string; nonce: string } | null> {
  if (!stateParam) return null;
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!raw) return null;
  try {
    const state = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as StatePayload;
    const [nonce] = String(stateParam).split('.');
    if (state.p !== provider || !state.n || nonce !== state.n || state.exp < Date.now()) return null;
    return { next: safeNext(state.next), nonce: state.n };
  } catch {
    return null;
  }
}

// ---------------- 建号 / 登录 ----------------

/** 按邮箱找号或自动注册（OAuth 免密：密码为 24 字节随机数，不可猜测） */
export async function finishOAuthLogin(email: string, name: string, next: string): Promise<string> {
  const mail = email.trim().toLowerCase();
  let user = findUserByEmail(mail);
  if (!user) {
    try {
      user = createUser({ email: mail, name: name.trim().slice(0, 40) || mail.split('@')[0], password: crypto.randomBytes(24).toString('hex') });
    } catch {
      // 授权回调偶发双发，撞到刚建好的号时改为直接登录
      user = findUserByEmail(mail);
    }
  } else {
    touchLogin(user.id);
  }
  if (!user) throw new Error('oauth: could not create or find user');
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
  return next;
}

export function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const part = String(idToken || '').split('.')[1];
  if (!part) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

// ---------------- Google id_token 严格验签（JWKS） ----------------

type GoogleJwk = { kty: string; kid: string; n: string; e: string };
let googleJwksCache: { keys: Map<string, crypto.KeyObject>; fetchedAt: number } | null = null;
const GOOGLE_JWKS_TTL_MS = 60 * 60 * 1000;

async function googleSigningKeys(): Promise<Map<string, crypto.KeyObject>> {
  if (googleJwksCache && Date.now() - googleJwksCache.fetchedAt < GOOGLE_JWKS_TTL_MS) {
    return googleJwksCache.keys;
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cache: 'no-store' });
  if (!res.ok) throw new Error(`google jwks fetch failed: ${res.status}`);
  const data = await res.json() as { keys?: GoogleJwk[] };
  const keys = new Map<string, crypto.KeyObject>();
  for (const k of data.keys ?? []) {
    if (k.kty !== 'RSA' || !k.kid) continue;
    keys.set(k.kid, crypto.createPublicKey({ key: k as unknown as crypto.JsonWebKey, format: 'jwk' }));
  }
  googleJwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * 严格验签 Google id_token（K-SEC-3）：
 * RS256 签名（JWKS，kid 轮换时强制刷新一次）+ iss + aud + exp + nonce。
 * 直连 token endpoint 换取不作为免验签理由（防御纵深，防将来获取方式变更/中间态）。
 * 校验失败抛错，由调用方转为登录失败提示。
 */
export async function verifyGoogleIdToken(idToken: string, expectedNonce: string): Promise<Record<string, unknown>> {
  const seg = String(idToken || '').split('.');
  if (seg.length !== 3) throw new Error('malformed id_token');
  const header = JSON.parse(Buffer.from(seg[0], 'base64url').toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected id_token alg/kid');

  const verify = async (keys: Map<string, crypto.KeyObject>): Promise<Record<string, unknown>> => {
    const key = keys.get(header.kid as string);
    if (!key) return {};
    const ok = crypto.createVerify('RSA-SHA256').update(`${seg[0]}.${seg[1]}`).verify(key, seg[2], 'base64url');
    if (!ok) throw new Error('id_token signature invalid');
    return decodeJwtPayload(idToken);
  };

  let claims = await verify(await googleSigningKeys());
  if (!claims.iss) {
    // kid 未命中（Google 轮换密钥）：强制刷新 JWKS 后重验一次
    claims = await verify(await googleSigningKeys());
    if (!claims.iss) throw new Error('id_token kid not found in JWKS');
  }

  const now = Math.floor(Date.now() / 1000);
  const iss = String(claims.iss);
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)];
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '');
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') throw new Error(`id_token iss unexpected: ${iss}`);
  if (!clientId || !aud.includes(clientId)) throw new Error('id_token audience mismatch');
  if (Number(claims.exp) + 60 < now) throw new Error('id_token expired');
  if (!expectedNonce || String(claims.nonce || '') !== expectedNonce) throw new Error('id_token nonce mismatch');
  return claims;
}

// ---------------- Apple client_secret（ES256 JWT，Apple 每次换 token 都要带） ----------------

function appleKeyPem(): string | null {
  const content = process.env.APPLE_KEY_CONTENT;
  if (content && content.includes('PRIVATE KEY')) return content.replace(/\\n/g, '\n');
  const file = process.env.APPLE_KEY_FILE;
  if (file) {
    try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
  }
  return null;
}

/** DER 编码的 ECDSA 签名 → JWT 需要的 r||s 原始 64 字节 */
function derSignatureToRaw(der: Buffer): Buffer {
  let idx = 2; // 跳过 SEQUENCE 头（P-256 的 r/s 长度 ≤ 33，长度必然是短格式）
  const readInt = (): Buffer => {
    const len = der[idx + 1];
    const v = der.subarray(idx + 2, idx + 2 + len);
    idx += 2 + len;
    return v[0] === 0 ? v.subarray(1) : v;
  };
  const r = readInt();
  const s = readInt();
  const out = Buffer.alloc(64);
  r.copy(out, 32 - r.length);
  s.copy(out, 64 - s.length);
  return out;
}

export function appleClientSecret(): string {
  const pem = appleKeyPem();
  if (!pem) throw new Error('APPLE key missing');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })));
  const claims = b64url(Buffer.from(JSON.stringify({
    iss: process.env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 3600,
    aud: 'https://appleid.apple.com',
    sub: process.env.APPLE_SERVICES_ID,
  })));
  const signingInput = `${header}.${claims}`;
  const signer = crypto.createSign('sha256');
  signer.update(signingInput);
  const raw = derSignatureToRaw(signer.sign(pem));
  return `${signingInput}.${b64url(raw)}`;
}
