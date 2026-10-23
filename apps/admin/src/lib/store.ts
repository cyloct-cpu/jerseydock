/**
 * 数据层（开发期文件存储，接入 PostgreSQL 后切换为 Prisma Client）
 * 目录约定见开发执行文档 §8；前后台通过 data/ 目录共享状态。
 */
import fs from 'node:fs';
import path from 'node:path';

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

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function readJsonl<T = Record<string, unknown>>(file: string): T[] {
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
}

export function writeJsonl<T>(file: string, rows: T[]): void {
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
