/**
 * 数据层（K-S0-3：已迁库实体经 Prisma schema 的 SQLite 库读写，见 lib/db-store.ts；
 * settings/overrides/events/contacts 等未迁库文件仍走 fs）
 * 目录约定见开发执行文档 §8；前后台通过 data/ 目录共享状态。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  dbReadOrders, dbWriteOrders, dbAppendOrder,
  dbReadUsers, dbWriteUsers,
  dbReadAdminsDoc, dbWriteAdminsDoc,
  dbListAudit, dbAppendAudit,
  dbReadFollowups, dbWriteFollowups,
  dbReadImported, dbWriteImported,
  dbReadBatches, dbWriteBatches,
  dbReadMedia, dbWriteMedia,
} from './db-store';

const DATA = path.resolve(process.cwd(), '..', '..', 'data');
const ADMIN = path.join(DATA, 'admin');

export const paths = {
  overrides: path.join(ADMIN, 'overrides.json'),        // 商品状态/价格覆盖（前台读取）
  imported: path.join(ADMIN, 'imported-products.json'), // 导入的商品（前台读取）
  importBatches: path.join(ADMIN, 'import-batches.json'),
  followups: path.join(ADMIN, 'followups.json'),        // 回访进度
  settings: path.join(ADMIN, 'settings.json'),          // 商店设置（前台读取）
  admins: path.join(ADMIN, 'admins.json'),
  media: path.join(ADMIN, 'media.json'),                // 图库索引（后台上传图片自动登记）
  audit: path.join(ADMIN, 'audit.jsonl'),
  orders: path.join(DATA, 'orders.jsonl'),              // 订单（前台创建）
  events: path.join(DATA, 'events.logl'),               // 埋点（前台写入）
  contacts: path.join(DATA, 'contacts.jsonl'),          // 联系表单（前台写入）
  users: path.join(DATA, 'users.jsonl'),                // 前台注册用户（含 WhatsApp/电话资料）
  imports: path.join(DATA, 'imports'),                  // 批量导入工作区
  exports: path.join(DATA, 'exports'),
};

/** 已迁库实体（按文件名识别；其余路径走原文件） */
function dbKind(file: string): string | null {
  switch (path.basename(file)) {
    case 'orders.jsonl': return 'orders';
    case 'users.jsonl': return 'users';
    case 'admins.json': return 'admins';
    case 'audit.jsonl': return 'audit';
    case 'followups.json': return 'followups';
    case 'imported-products.json': return 'imported';
    case 'import-batches.json': return 'batches';
    case 'media.json': return 'media';
    default: return null;
  }
}

function dbReadKind<T>(kind: string): T[] {
  switch (kind) {
    case 'orders': return dbReadOrders() as T[];
    case 'users': return dbReadUsers() as T[];
    case 'admins': return (dbReadAdminsDoc().users ?? []) as T[];
    case 'audit': return dbListAudit() as T[];
    case 'followups': return dbReadFollowups() as T[];
    case 'imported': return dbReadImported() as T[];
    case 'batches': return dbReadBatches() as T[];
    case 'media': return dbReadMedia() as T[];
    default: return [];
  }
}

function dbWriteKind(kind: string, rows: unknown[]): void {
  const recs = rows as Record<string, unknown>[];
  switch (kind) {
    case 'orders': dbWriteOrders(rows as never); break;
    case 'users': dbWriteUsers(rows as never); break;
    case 'admins': dbWriteAdminsDoc({ users: recs }); break;
    case 'followups': dbWriteFollowups(recs); break;
    case 'imported': dbWriteImported(recs); break;
    case 'batches': dbWriteBatches(recs); break;
    case 'media': dbWriteMedia(recs); break;
    // audit 无全量写场景，忽略
  }
}

export function readJson<T>(file: string, fallback: T): T {
  const kind = dbKind(file);
  if (kind) {
    try {
      if (kind === 'admins') return dbReadAdminsDoc() as T;
      return dbReadKind<T>(kind) as T;
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  const kind = dbKind(file);
  if (kind && Array.isArray((data as { users?: unknown[] })?.users ?? data)) {
    dbWriteKind(kind, ((data as { users?: unknown[] }).users ?? data) as unknown[]);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function readJsonl<T = Record<string, unknown>>(file: string): T[] {
  const kind = dbKind(file);
  if (kind) {
    try {
      return dbReadKind<T>(kind);
    } catch {
      return [];
    }
  }
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l) as T; } catch { return null; } })
      .filter((x): x is T => x !== null);
  } catch {
    return [];
  }
}

export function appendJsonl(file: string, row: unknown): void {
  const kind = dbKind(file);
  if (kind === 'orders') {
    dbAppendOrder(row as never);
    return;
  }
  if (kind === 'audit') {
    dbAppendAudit(row as Record<string, unknown>);
    return;
  }
  if (kind) {
    const rows = dbReadKind<Record<string, unknown>>(kind);
    rows.push(row as Record<string, unknown>);
    dbWriteKind(kind, rows);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
}

export function writeJsonl<T>(file: string, rows: T[]): void {
  const kind = dbKind(file);
  if (kind) {
    dbWriteKind(kind, rows as unknown[]);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

/** 导出 CSV（订单/客户报表，data/exports/） */
export function writeCsv(file: string, headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, csv, 'utf8');
  return file;
}
