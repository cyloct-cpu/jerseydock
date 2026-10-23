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

/** 校验 state（provider 必须一致、nonce 必须与 cookie 内记录一致、未过期）；返回 next */
export async function verifyStateCookie(provider: 'google' | 'apple', stateParam: string | null): Promise<string | null> {
  if (!stateParam) return null;
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!raw) return null;
  try {
    const state = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as StatePayload;
    const [nonce] = String(stateParam).split('.');
    if (state.p !== provider || !state.n || nonce !== state.n || state.exp < Date.now()) return null;
    return safeNext(state.next);
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
