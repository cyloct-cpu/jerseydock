/**
 * DB 数据层（K-S0-3：JSONL 文件 → SQLite 的拦截层）
 * - 库：packages/db/prisma/dev.db（schema 由 Prisma 管理，见 packages/db）
 * - 用 node:sqlite 同步 API（调用方原为同步 fs 读写，保持签名不变、调用方零改动）
 * - 提供的是"原文件 JSON 结构"级读写：pack/unpack 保证字段往返无损，
 *   溢出字段存 ext 列（JSON 文本）。调用方拿到的对象与原 JSONL 行一致。
 * - web/admin 两份同内容（独立构建，改一处需同步另一处）
 * - 未迁库文件（settings/overrides/events/contacts 等）仍走文件，不经这里
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const newId = (): string => randomUUID().replace(/-/g, '');

const DB_PATH = path.resolve(process.cwd(), '..', '..', 'packages', 'db', 'prisma', 'dev.db');

let _db: DatabaseSync | null = null;
function db(): DatabaseSync {
  if (!_db) _db = new DatabaseSync(DB_PATH);
  return _db;
}

/** SQL 参数转换（node:sqlite 不接受 unknown） */
const S = (v: unknown): string | null => (v == null ? null : String(v));
const N = (v: unknown): number => Number(v) || 0;

// ---------------- 订单 ----------------

export type OrderRow = Record<string, unknown> & { orderNo: string };

const ORDER_ADDR_KEYS = ['name', 'address', 'city', 'country', 'zip'] as const;

/** DB 行 → 原 JSONL 订单对象（address/ext 解包，字段展开到顶层） */
function dbRowToOrder(r: Record<string, unknown>): OrderRow {
  const addr = JSON.parse((r.address as string) ?? '{}');
  const ext = JSON.parse((r.ext as string) ?? '{}');
  const o: OrderRow = {
    orderNo: r.orderNo as string,
    email: r.email as string,
    currency: r.currency,
    items: JSON.parse((r.items as string) ?? '[]'),
    subtotalUsd: r.subtotalUsd,
    discountUsd: r.discountUsd,
    shippingUsd: r.shippingUsd,
    totalUsd: r.totalUsd,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    fulfillmentStatus: r.fulfillmentStatus,
    phone: r.phone,
    createdAt: r.createdAt,
    ...addr,
    ...ext,
  };
  return o;
}

/** 原 JSONL 订单对象 → DB 行（known 字段映射，其余进 ext） */
function orderToDbRow(o: OrderRow): Record<string, string | number | null> {
  const known = new Set(['orderNo', 'email', 'name', 'address', 'city', 'country', 'zip', 'currency', 'items', 'subtotalUsd', 'discountUsd', 'shippingUsd', 'totalUsd', 'paymentMethod', 'paymentStatus', 'fulfillmentStatus', 'shipment', 'createdAt', 'shippedAt', 'phone']);
  const ext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.has(k)) ext[k] = v;
  const addr: Record<string, unknown> = {};
  for (const k of ORDER_ADDR_KEYS) addr[k] = o[k] ?? null;
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString();
  return {
    orderNo: String(o.orderNo),
    email: String(o.email ?? ''),
    subtotalUsd: Number(o.subtotalUsd) || 0,
    discountUsd: Number(o.discountUsd) || 0,
    shippingUsd: Number(o.shippingUsd) || 0,
    totalUsd: Number(o.totalUsd) || 0,
    currency: String(o.currency ?? 'USD'),
    paymentStatus: String(o.paymentStatus ?? 'pending'),
    fulfillmentStatus: String(o.fulfillmentStatus ?? 'unfulfilled'),
    paymentMethod: o.paymentMethod == null ? null : String(o.paymentMethod),
    phone: o.phone == null ? null : String(o.phone),
    items: JSON.stringify(o.items ?? []),
    address: JSON.stringify(addr),
    ext: JSON.stringify(ext),
    createdAt,
    updatedAt: (o.shippedAt as string) || createdAt,
  };
}

export function dbReadOrders(): OrderRow[] {
  const rows = db().prepare('SELECT * FROM "Order" ORDER BY createdAt').all() as Record<string, unknown>[];
  return rows.map(dbRowToOrder);
}

export function dbWriteOrders(rows: OrderRow[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM "Order"');
    const ins = d.prepare('INSERT INTO "Order" (id,orderNo,email,subtotalUsd,discountUsd,shippingUsd,totalUsd,currency,paymentStatus,fulfillmentStatus,paymentMethod,phone,items,address,ext,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const o of rows) {
      const r = orderToDbRow(o);
      ins.run(newId(), r.orderNo, r.email, r.subtotalUsd, r.discountUsd, r.shippingUsd, r.totalUsd, r.currency, r.paymentStatus, r.fulfillmentStatus, r.paymentMethod, r.phone, r.items, r.address, r.ext, r.createdAt, r.updatedAt);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function dbAppendOrder(o: OrderRow): void {
  const r = orderToDbRow(o);
  // 幂等 upsert：已存在则按 orderNo 更新（id 保持不变）
  const exist = db().prepare('SELECT id FROM "Order" WHERE orderNo = ?').get(r.orderNo) as { id: string } | undefined;
  const id = exist?.id ?? newId();
  db().prepare('INSERT INTO "Order" (id,orderNo,email,subtotalUsd,discountUsd,shippingUsd,totalUsd,currency,paymentStatus,fulfillmentStatus,paymentMethod,phone,items,address,ext,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(orderNo) DO UPDATE SET email=excluded.email, subtotalUsd=excluded.subtotalUsd, discountUsd=excluded.discountUsd, shippingUsd=excluded.shippingUsd, totalUsd=excluded.totalUsd, currency=excluded.currency, paymentStatus=excluded.paymentStatus, fulfillmentStatus=excluded.fulfillmentStatus, paymentMethod=excluded.paymentMethod, phone=excluded.phone, items=excluded.items, address=excluded.address, ext=excluded.ext, updatedAt=excluded.updatedAt')
    .run(id, r.orderNo, r.email, r.subtotalUsd, r.discountUsd, r.shippingUsd, r.totalUsd, r.currency, r.paymentStatus, r.fulfillmentStatus, r.paymentMethod, r.phone, r.items, r.address, r.ext, r.createdAt, r.updatedAt);
}

// ---------------- 前台用户 ----------------

export type UserRow = Record<string, unknown> & { id: string; email: string };

function dbRowToUser(r: Record<string, unknown>): UserRow {
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name,
    passwordHash: r.passwordHash,
    phone: r.phone,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
    ...JSON.parse((r.ext as string) ?? '{}'),
  };
}

function userToDbRow(u: UserRow): Record<string, string | number | null> {
  const known = new Set(['id', 'email', 'name', 'passwordHash', 'phone', 'createdAt', 'lastLoginAt']);
  const ext: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(u)) if (!known.has(k)) ext[k] = v;
  return {
    id: String(u.id),
    email: String(u.email),
    name: u.name == null ? null : String(u.name),
    passwordHash: String(u.passwordHash ?? ''),
    phone: u.phone == null ? null : String(u.phone),
    createdAt: (u.createdAt as string) ?? new Date().toISOString(),
    lastLoginAt: (u.lastLoginAt as string) ?? null,
    ext: JSON.stringify(ext),
  };
}

export function dbReadUsers(): UserRow[] {
  return (db().prepare('SELECT * FROM User').all() as Record<string, unknown>[]).map(dbRowToUser);
}

export function dbWriteUsers(rows: UserRow[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM User');
    const ins = d.prepare('INSERT INTO User (id,email,name,passwordHash,phone,createdAt,lastLoginAt,ext) VALUES (?,?,?,?,?,?,?,?)');
    for (const u of rows) {
      const r = userToDbRow(u);
      ins.run(r.id, r.email, r.name, r.passwordHash, r.phone, r.createdAt, r.lastLoginAt, r.ext);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

// ---------------- 后台管理员（admins.json ⇄ AdminUser） ----------------

export function dbReadAdminsDoc(): { users: Record<string, unknown>[] } {
  const users = (db().prepare('SELECT * FROM AdminUser').all() as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    roleName: r.roleName,
    passwordHash: r.passwordHash,
    permissions: JSON.parse((r.permissions as string) ?? '[]'),
    lastLoginAt: r.lastLoginAt,
    lastPasswordAt: r.lastPasswordAt,
    createdAt: r.createdAt,
  }));
  return { users };
}

export function dbWriteAdminsDoc(doc: { users: Record<string, unknown>[] }): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM AdminUser');
    const ins = d.prepare('INSERT INTO AdminUser (id,email,passwordHash,name,role,roleName,permissions,lastLoginAt,lastPasswordAt,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const a of doc.users ?? []) {
      ins.run(S(a.id ?? a.email), S(a.email), String(a.passwordHash ?? ''), S(a.name), S(a.role) ?? 'operator', S(a.roleName), JSON.stringify(a.permissions ?? []), S(a.lastLoginAt), S(a.lastPasswordAt), S(a.createdAt) ?? new Date().toISOString());
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

// ---------------- 审计（audit.jsonl ⇄ AuditLog） ----------------

export function dbListAudit(): Record<string, unknown>[] {
  return (db().prepare('SELECT * FROM AuditLog ORDER BY createdAt').all() as Record<string, unknown>[]).map((r) => ({
    adminUserId: r.adminUserId,
    action: r.action,
    ts: r.createdAt,
    target: r.target,
    meta: r.meta ? JSON.parse(r.meta as string) : null,
  }));
}

export function dbAppendAudit(row: Record<string, unknown>): void {
  const meta = row.meta == null ? null : typeof row.meta === 'string' ? row.meta : JSON.stringify(row.meta);
  db().prepare('INSERT INTO AuditLog (id,adminUserId,action,target,meta,createdAt) VALUES (lower(hex(randomblob(12))),?,?,?,?,?)')
    .run((row.adminUserId as string) ?? null, String(row.action ?? ''), (row.target as string) ?? null, meta, (row.ts as string) ?? new Date().toISOString());
}

// ---------------- 回访（followups.json ⇄ FollowUp） ----------------

export function dbReadFollowups(): Record<string, unknown>[] {
  return (db().prepare('SELECT * FROM FollowUp').all() as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    customerKey: r.customerKey,
    email: r.customerKey,
    status: r.status,
    nextAt: r.nextAt,
    owner: r.owner,
    note: r.note,
    history: JSON.parse((r.history as string) ?? '[]'),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export function dbWriteFollowups(rows: Record<string, unknown>[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM FollowUp');
    const ins = d.prepare('INSERT INTO FollowUp (id,customerId,customerKey,status,nextAt,owner,note,history,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const now = new Date().toISOString();
    for (const f of rows) {
      ins.run(S(f.id), null, S(f.customerKey) ?? S(f.email), S(f.status) ?? 'pending', S(f.nextAt), S(f.owner), S(f.note), JSON.stringify(f.history ?? []), S(f.createdAt) ?? now, S(f.updatedAt) ?? now);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

// ---------------- 导入商品 / 批次 / 媒体 ----------------

// 导入域 = ext 无 src 标记的 Product 行（数据集种子带 src:'dataset'，同步商品将来带 src:'sync'）
const IMPORTED_DOMAIN = "ext IS NOT NULL AND json_extract(ext,'$.h') IS NOT NULL AND json_extract(ext,'$.src') IS NULL";

/** 导入商品（仅导入域）：列表直接还原原 JSON 结构 */
export function dbReadImported(): Record<string, unknown>[] {
  return (db().prepare(`SELECT ext FROM Product WHERE ${IMPORTED_DOMAIN} ORDER BY rowid`).all() as Record<string, unknown>[]).map((r) => JSON.parse(r.ext as string));
}

export function dbWriteImported(rows: Record<string, unknown>[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec(`DELETE FROM Product WHERE ${IMPORTED_DOMAIN}`);
    const ins = d.prepare('INSERT INTO Product (id,sku,slug,titleEn,basePriceUsd,comparePriceUsd,images,status,ext,createdAt,updatedAt) VALUES (lower(hex(randomblob(12))),?,?,?,?,?,?,?,?,?,?)');
    const now = new Date().toISOString();
    for (const r of rows) {
      const slug = String(r.h);
      ins.run(r.sku ? String(r.sku) : slug, slug, S(r.t) ?? slug, N(r.p), r.c != null ? N(r.c) : null, JSON.stringify(r.i ?? []), 'active', JSON.stringify(r), now, now);
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

/** 前台目录（K-S0-4）：全部商品（数据集种子 + 导入域），返回原 JSON 对象；软删（archived）不返回 */
export function dbReadAllCatalog(): Record<string, unknown>[] {
  return (db().prepare("SELECT ext FROM Product WHERE status != 'archived' AND ext IS NOT NULL AND json_extract(ext,'$.h') IS NOT NULL ORDER BY rowid").all() as Record<string, unknown>[]).map((r) => JSON.parse(r.ext as string));
}

export function dbReadBatches(): Record<string, unknown>[] {
  return (db().prepare('SELECT * FROM ImportBatch').all() as Record<string, unknown>[]).map((r) => ({
    id: r.id,
    folderName: r.folderName,
    fileCount: r.fileCount,
    productCount: r.productCount,
    status: r.status,
    failed: JSON.parse((r.log as string) ?? '[]'),
    createdAt: r.createdAt,
  }));
}

export function dbWriteBatches(rows: Record<string, unknown>[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM ImportBatch');
    const ins = d.prepare('INSERT INTO ImportBatch (id,folderName,fileCount,productCount,status,log,createdAt) VALUES (?,?,?,?,?,?,?)');
    for (const b of rows) {
      ins.run(S(b.id), S(b.folderName), N(b.fileCount), N(b.productCount), S(b.status) ?? 'parsed', JSON.stringify(b.failed ?? []), S(b.createdAt) ?? new Date().toISOString());
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function dbReadMedia(): Record<string, unknown>[] {
  return (db().prepare('SELECT * FROM MediaEntry').all() as Record<string, unknown>[]).map((r) => ({
    url: r.url,
    name: r.name,
    size: r.size,
    source: r.source,
    uploadedAt: r.uploadedAt,
  }));
}

export function dbWriteMedia(rows: Record<string, unknown>[]): void {
  const d = db();
  d.exec('BEGIN');
  try {
    d.exec('DELETE FROM MediaEntry');
    const ins = d.prepare('INSERT INTO MediaEntry (url,name,size,source,uploadedAt) VALUES (?,?,?,?,?)');
    for (const m of rows) {
      ins.run(S(m.url), S(m.name), N(m.size), S(m.source), S(m.uploadedAt) ?? new Date().toISOString());
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
