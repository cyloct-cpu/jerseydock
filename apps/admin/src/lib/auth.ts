/**
 * 后台鉴权（需求 N6：管理系统与前台分离，独立登录体系）
 *
 * - 会话：自签 HMAC-SHA256 token，存 httpOnly Cookie（kv_admin_session）
 * - 密码：scrypt（node:crypto，仅在 Server Action 内使用）
 * - 用户源：data/admin/admins.json（接入数据库后切换为 AdminUser 表，见 packages/db）
 * - 密钥：环境变量 ADMIN_SESSION_SECRET；缺失时用开发默认值（生产必须覆盖）
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SESSION_COOKIE_NAME, verifySessionEdge } from './session';

export { SESSION_COOKIE_NAME, verifySessionEdge };

const ADMINS_FILE = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'admins.json');
const AUDIT_FILE = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'audit.jsonl');
const SESSION_DAYS = 7;

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || 'kitvault-dev-session-secret-change-me';
}

export type AdminRole = 'owner' | 'operator' | 'viewer';

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** 自定义角色名，如「运营主管」「客服专员」；owner 恒为「Owner」 */
  roleName: string;
  /** 已开通的权限 key；owner 恒为全部 */
  permissions: string[];
  lastLoginAt?: string | null;
  lastPasswordAt?: string | null;
};

type StoredUser = Omit<AdminUser, 'permissions'> & { passwordHash: string; createdAt?: string; permissions?: string[] };

/** 默认角色名（非 owner 时用于回退显示） */
const DEFAULT_ROLE_NAME: Record<string, string> = { operator: '运营', viewer: '只读', owner: 'Owner' };

/** 清洗自定义角色名：长度限制 + 去除控制字符，空则用默认 */
export function sanitizeRoleName(input: unknown, role: AdminRole): string {
  if (role === 'owner') return 'Owner';
  const s = String(input ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);
  return s || DEFAULT_ROLE_NAME[role] || '运营';
}

// ---------------- 权限定义（常量统一在 perm-client.ts，客户端组件也用它） ----------------

// re-export，供服务端各处统一从 auth.ts 引入
export {
  PERMISSION_GROUPS,
  PERM_ADMINS_MANAGE,
  ALL_PERMISSIONS,
  PRESET_READONLY,
  PRESET_OPERATOR,
  PRESET_SUPPORT,
  PERMISSION_PRESETS,
  PAGE_PERMISSIONS,
} from './perm-client';

import {
  ALL_PERMISSIONS,
  PERM_ADMINS_MANAGE,
  PERMISSION_PRESETS,
  PRESET_OPERATOR,
  PRESET_READONLY,
  PRESET_SUPPORT,
} from './perm-client';

/** 判断是否拥有权限；owner 恒真 */
export function can(user: Pick<AdminUser, 'role' | 'permissions'> | null | undefined, perm: string): boolean {
  if (!user) return false;
  if (user.role === 'owner') return true;
  return (user.permissions || []).includes(perm);
}

/** 账号实际权限：owner 返回全部，普通账号返回已配置项 */
export function permissionsOf(u: { role: AdminRole; permissions?: string[] | null }): string[] {
  if (u.role === 'owner') return ALL_PERMISSIONS;
  const valid = new Set(ALL_PERMISSIONS);
  return (u.permissions || []).filter(p => valid.has(p));
}

/** 清洗提交的权限数组：去重、去非法项；非 owner 不给账号管理权 */
export function sanitizePermissions(input: unknown, role: AdminRole): string[] {
  const arr = Array.isArray(input) ? input.map(String) : [];
  const valid = new Set(ALL_PERMISSIONS);
  const set = new Set(arr.filter(p => valid.has(p)));
  if (role === 'owner') return ALL_PERMISSIONS;
  set.delete(PERM_ADMINS_MANAGE);
  return ALL_PERMISSIONS.filter(p => set.has(p));
}

function readUsers(): StoredUser[] {
  try {
    const j = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
    return Array.isArray(j.users) ? j.users : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  fs.mkdirSync(path.dirname(ADMINS_FILE), { recursive: true });
  fs.writeFileSync(ADMINS_FILE, JSON.stringify({ users }, null, 2), 'utf8');
}

/** 读用户列表（供账号管理页使用，含密码哈希，仅服务端） */
export function listUsers(): StoredUser[] {
  return readUsers();
}

/** 按 id 读用户（Route Handler 等非 React Server Action 环境用） */
export function readUserById(id: string): AdminUser | null {
  const u = readUsers().find(x => x.id === id);
  return u ? toPublicUser(u) : null;
}

/** 新增用户 */
export function createUser(u: {
  email: string;
  name: string;
  role: AdminRole;
  roleName?: string;
  password: string;
  permissions: string[];
}): AdminUser {
  const users = readUsers();
  const email = u.email.trim().toLowerCase();
  if (users.some(x => x.email.toLowerCase() === email)) throw new Error(`邮箱已存在：${u.email}`);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: 'adm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    email,
    name: u.name.trim() || u.email.split('@')[0],
    role: u.role,
    roleName: sanitizeRoleName(u.roleName, u.role),
    permissions: sanitizePermissions(u.permissions, u.role),
    passwordHash: hashPassword(u.password),
    createdAt: now,
    lastLoginAt: null,
    lastPasswordAt: now,
  };
  users.push(user);
  writeUsers(users);
  return toPublicUser(user);
}

/** 更新账号资料与权限 */
export function updateUser(
  id: string,
  patch: { name?: string; role?: AdminRole; roleName?: string; permissions?: string[] },
): AdminUser | null {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return null;
  if (patch.name !== undefined) u.name = patch.name.trim() || u.email.split('@')[0];
  if (patch.role && patch.role !== u.role) {
    // 保底：不能把最后一个 owner 降级
    if (u.role === 'owner' && users.filter(x => x.role === 'owner').length <= 1) {
      throw new Error('系统必须保留至少一个 Owner 账号');
    }
    u.role = patch.role;
    u.permissions = sanitizePermissions(u.permissions ?? [], patch.role);
  }
  if (patch.roleName !== undefined) u.roleName = sanitizeRoleName(patch.roleName, u.role);
  if (patch.permissions) u.permissions = sanitizePermissions(patch.permissions, u.role);
  writeUsers(users);
  return toPublicUser(u);
}

/** 重置密码（owner 使用；不返回明文，仅记录审计） */
export function resetPassword(id: string, newPassword: string): boolean {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return false;
  u.passwordHash = hashPassword(newPassword);
  u.lastPasswordAt = new Date().toISOString();
  writeUsers(users);
  return true;
}

/** 删除账号：不能删自己、不能删最后一个 owner */
export function deleteUser(id: string, byId: string): void {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return;
  if (id === byId) throw new Error('不能删除当前登录的账号');
  if (u.role === 'owner' && users.filter(x => x.role === 'owner').length <= 1) {
    throw new Error('系统必须保留至少一个 Owner 账号');
  }
  writeUsers(users.filter(x => x.id !== id));
}

/** 密码变更审计（读 audit.jsonl） */
export function passwordHistory(limit = 50): { ts: string; action: string; target: string; by: string }[] {
  const rows: { ts: string; action: string; target: string; by: string }[] = [];
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try {
        const j = JSON.parse(l) as { ts: string; action: string; target?: string; adminUserId?: string | null };
        if (j.action.startsWith('password:')) rows.push({ ts: j.ts, action: j.action, target: j.target || '', by: j.adminUserId || '' });
      } catch {}
    }
  } catch {}
  return rows.slice(-limit).reverse();
}

// ---------------- 密码 ----------------

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

// ---------------- 会话 token（HMAC-SHA256，与 middleware 用的 Web Crypto 兼容） ----------------

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function signSession(adminId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ sub: adminId, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
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

export function findUserByEmail(email: string): StoredUser | undefined {
  return readUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function touchLogin(id: string): void {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (u) {
    u.lastLoginAt = new Date().toISOString();
    writeUsers(users);
  }
}

export function toPublicUser(u: StoredUser): AdminUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleName: u.role === 'owner' ? 'Owner' : sanitizeRoleName(u.roleName, u.role),
    permissions: permissionsOf(u),
    lastLoginAt: u.lastLoginAt ?? null,
    lastPasswordAt: u.lastPasswordAt ?? null,
  };
}

/**
 * 自助改密码：必须验证旧密码。
 * 返回 null 表示旧密码错误；返回 { ok: true } 表示成功。
 */
export function changeOwnPassword(id: string, oldPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const users = readUsers();
  const u = users.find(x => x.id === id);
  if (!u) return { ok: false, error: '账号不存在' };
  if (!verifyPassword(oldPassword, u.passwordHash)) return { ok: false, error: '原密码不正确' };
  if (newPassword.length < 8) return { ok: false, error: '新密码至少 8 位' };
  u.passwordHash = hashPassword(newPassword);
  u.lastPasswordAt = new Date().toISOString();
  writeUsers(users);
  return { ok: true };
}

/** 操作审计（开发执行文档 §5 AuditLog） */
export function audit(adminUserId: string | null, action: string, target?: string, meta?: unknown): void {
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ adminUserId, action, target, meta, ts: new Date().toISOString() }) + '\n', 'utf8');
  } catch {}
}
