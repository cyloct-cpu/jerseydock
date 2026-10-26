import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { dbReadUsers, dbWriteUsers } from './db-store';

/**
 * 前台用户（终端顾客）账号存储与会话
 * - 存储：SQLite（packages/db/prisma/dev.db，K-S0-3 起替代 users.jsonl）
 * - 密码：scrypt 单向哈希（与后台 admin 同算法，盐随机）
 * - 会话：HMAC-SHA256 签名 cookie（kv_session），30 天
 * - 仅服务端使用（Server Action / Server Component），勿在客户端 import
 */

export const SESSION_COOKIE = 'kv_session';
const SESSION_DAYS = 30;

function secret(): string {
  return process.env.WEB_SESSION_SECRET || 'kitvault-dev-web-secret-change-me';
}

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
  /** 联系电话（账户中心可维护，结账预填） */
  phone?: string;
  /** WhatsApp 号码（账户中心可维护，后台 CRM 回访用） */
  whatsapp?: string;
  /** 默认收货地址（账户中心可维护，结账预填）；与 addresses[0] 保持同步 */
  address?: UserAddress;
  /** 地址簿（多地址，地址中心可维护；首个为默认） */
  addresses?: AddressEntry[];
};

/** 地址簿条目（首个为默认收货地址） */
export type AddressEntry = UserAddress & { id: string };

/** 收货地址（账户中心维护，结账页预填） */
export type UserAddress = {
  address: string;
  city: string;
  country: string;
  zip: string;
};

export type PublicUser = { id: string; email: string; name: string };

function readUsers(): StoredUser[] {
  return dbReadUsers() as unknown as StoredUser[];
}

function writeUsers(users: StoredUser[]): void {
  dbWriteUsers(users as never);
}

// ---------------- 密码（与后台同算法） ----------------

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(pw, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------------- 会话 token ----------------

export function signSession(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { sub: string; exp: number } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
    if (!data.sub || !data.exp || data.exp < Date.now()) return null;
    return { sub: String(data.sub), exp: Number(data.exp) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 86400,
  };
}

// ---------------- 用户操作 ----------------

export function toPublicUser(u: StoredUser): PublicUser {
  return { id: u.id, email: u.email, name: u.name };
}

export function findUserByEmail(email: string): StoredUser | undefined {
  return readUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string): StoredUser | undefined {
  return readUsers().find(u => u.id === id);
}

/** 注册：邮箱查重 + 密码强度由调用方校验；返回错误消息或用户 */
export function createUser(input: { email: string; name: string; password: string }): StoredUser {
  const email = input.email.trim().toLowerCase();
  if (findUserByEmail(email)) throw new Error('An account with this email already exists');
  const user: StoredUser = {
    id: 'u_' + crypto.randomBytes(9).toString('hex'),
    email,
    name: input.name.trim() || email.split('@')[0],
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  return user;
}

export function touchLogin(id: string): void {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  u.lastLoginAt = new Date().toISOString();
  writeUsers(users);
}

/** 从请求 cookie 读取当前登录用户（Server Component / Server Action 内可用） */
export async function getSessionUserServer(): Promise<PublicUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = verifySessionToken(token);
    if (!session) return null;
    const u = getUserById(session.sub);
    return u ? toPublicUser(u) : null;
  } catch {
    return null;
  }
}

/**
 * 读取当前登录用户的完整记录（含 phone/address）。
 * 仅限服务端使用——严禁把 passwordHash 传进客户端组件。
 */
export async function getSessionUserFull(): Promise<StoredUser | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = verifySessionToken(token);
    if (!session) return null;
    return getUserById(session.sub) ?? null;
  } catch {
    return null;
  }
}

// ---------------- 账户资料维护（账户中心） ----------------

function mutateUser(id: string, fn: (u: StoredUser) => void): StoredUser | null {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return null;
  fn(u);
  writeUsers(users);
  return u;
}

/** 更新公开资料：姓名 + 联系电话 + WhatsApp（邮箱为登录标识，不可在此修改） */
export function updateUserProfile(id: string, input: { name: string; phone: string; whatsapp: string }): StoredUser | null {
  return mutateUser(id, u => {
    const name = input.name.trim().slice(0, 40);
    if (name) u.name = name;
    u.phone = input.phone.trim().slice(0, 30);
    u.whatsapp = input.whatsapp.trim().slice(0, 30);
  });
}

/** 读取地址簿（旧单地址自动升级为地址簿首条；不落盘，读时归一化） */
export function getUserAddresses(user: StoredUser): AddressEntry[] {
  if (user.addresses?.length) return user.addresses;
  if (user.address) return [{ id: 'default', ...user.address }];
  return [];
}

/** 默认地址（地址簿首条；无则回退旧字段） */
export function getDefaultAddress(user: StoredUser): AddressEntry | null {
  return getUserAddresses(user)[0] ?? null;
}

/** 首条地址同步到旧字段 u.address，保证结账旧预填逻辑不破 */
function syncLegacyDefault(u: StoredUser): void {
  u.address = u.addresses?.[0]
    ? { address: u.addresses[0].address, city: u.addresses[0].city, country: u.addresses[0].country, zip: u.addresses[0].zip }
    : u.address;
}

/** 保存地址（新增或按 id 更新；新地址可设为默认 = 插到首位） */
export function saveUserAddress(id: string, input: { entryId?: string; address: string; city: string; country: string; zip: string; makeDefault?: boolean }): StoredUser | null {
  const entry: AddressEntry = {
    id: input.entryId || 'addr_' + Date.now().toString(36),
    address: input.address.trim().slice(0, 200),
    city: input.city.trim().slice(0, 80),
    country: input.country.trim().slice(0, 80),
    zip: input.zip.trim().slice(0, 20),
  };
  return mutateUser(id, u => {
    const book = getUserAddresses(u);
    const idx = input.entryId ? book.findIndex(a => a.id === input.entryId) : -1;
    if (idx >= 0) book[idx] = entry; else book.push(entry);
    // 上限 10 条：超过时淘汰首位之后最旧的条目（默认地址保留）
    while (book.length > 10) book.splice(1, 1);
    // 新增的地址默认成为默认地址；编辑不改变默认（除非显式 makeDefault）
    if (input.makeDefault || idx < 0) {
      u.addresses = [entry, ...book.filter(a => a.id !== entry.id)];
    } else {
      u.addresses = book;
    }
    syncLegacyDefault(u);
  });
}

/** 删除地址；删除默认地址时顺延下一条为默认 */
export function deleteUserAddress(id: string, entryId: string): StoredUser | null {
  return mutateUser(id, u => {
    u.addresses = getUserAddresses(u).filter(a => a.id !== entryId);
    syncLegacyDefault(u);
  });
}

/** 设为默认：把该地址移到地址簿首位 */
export function makeDefaultAddress(id: string, entryId: string): StoredUser | null {
  return mutateUser(id, u => {
    const book = getUserAddresses(u);
    const idx = book.findIndex(a => a.id === entryId);
    if (idx <= 0) return;
    const [entry] = book.splice(idx, 1);
    u.addresses = [entry, ...book];
    syncLegacyDefault(u);
  });
}

/** 修改自己的密码（校验原密码；成功后会话保持有效） */
export function changeUserPassword(id: string, oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return { ok: false, error: 'Account not found' };
  if (!verifyPassword(oldPassword, u.passwordHash)) return { ok: false, error: 'Current password is incorrect' };
  if (newPassword.length < 8) return { ok: false, error: 'New password must be at least 8 characters' };
  u.passwordHash = hashPassword(newPassword);
  writeUsers(users);
  return { ok: true };
}
