// K-S0-2:JSONL/JSON → SQLite(Prisma)一次性迁移脚本
// 用法:
//   node scripts/migrate-jsonl-to-db.mjs              # dry-run,只统计不写入
//   node scripts/migrate-jsonl-to-db.mjs --write      # 实际写入(upsert 幂等,可重复跑)
//   node scripts/migrate-jsonl-to-db.mjs --export-back  # 从 DB 导回 JSONL 到 data/export-back-<ts>/(回退用)
//
// 原则:只读旧文件、只写新库,旧文件永不修改(开发执行文档 §12.5 纪律)。
// 不迁移(留文件,决策见 §12.6):settings.json、events.logl、visitors.json、
// verify-codes.jsonl、oms/、search/、mt-cache/、overrides.json(K-S0-4 随数据集一起入库)。
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');
const EXPORT_BACK = process.argv.includes('--export-back');
const J = (v) => JSON.stringify(v ?? null);
const D = (v) => (v ? new Date(v) : null);
const report = [];

function readJson(rel) {
  const p = path.join(DATA, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
function readLines(rel) {
  const p = path.join(DATA, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

// ---------------- 各源映射 ----------------

async function migrateUsers() {
  const rows = readLines('users.jsonl');
  let n = 0;
  for (const r of rows) {
    const data = {
      id: r.id,
      email: r.email,
      name: r.name ?? null,
      passwordHash: r.passwordHash,
      phone: r.phone ?? null,
      createdAt: D(r.createdAt) ?? new Date(),
      lastLoginAt: D(r.lastLoginAt),
      ext: J({ whatsapp: r.whatsapp, addresses: r.addresses, address: r.address }),
    };
    if (WRITE) {
      await prisma.user.upsert({ where: { id: r.id }, create: data, update: data });
      n++;
    }
  }
  report.push(['users.jsonl', 'User', rows.length, n]);
}

async function migrateOrders() {
  const rows = readLines('orders.jsonl');
  let n = 0;
  for (const r of rows) {
    const known = new Set(['orderNo', 'email', 'name', 'address', 'city', 'country', 'zip', 'currency', 'items', 'subtotalUsd', 'discountUsd', 'shippingUsd', 'totalUsd', 'paymentMethod', 'paymentStatus', 'fulfillmentStatus', 'shipment', 'createdAt', 'shippedAt', 'phone']);
    const ext = { shipment: r.shipment };
    for (const [k, v] of Object.entries(r)) if (!known.has(k)) ext[k] = v; // 溢出字段保真(oms/款项等将来字段)
    const data = {
      orderNo: r.orderNo,
      email: r.email,
      subtotalUsd: r.subtotalUsd ?? 0,
      discountUsd: r.discountUsd ?? 0,
      shippingUsd: r.shippingUsd ?? 0,
      totalUsd: r.totalUsd ?? 0,
      currency: r.currency ?? 'USD',
      paymentStatus: r.paymentStatus ?? 'pending',
      fulfillmentStatus: r.fulfillmentStatus ?? 'unfulfilled',
      paymentMethod: r.paymentMethod ?? null,
      phone: r.phone ?? null,
      address: J({ name: r.name, address: r.address, city: r.city, country: r.country, zip: r.zip }),
      items: J(r.items ?? []),
      ext: J(ext),
      createdAt: D(r.createdAt) ?? new Date(),
      updatedAt: D(r.shippedAt) ?? D(r.createdAt) ?? new Date(),
    };
    if (WRITE) {
      await prisma.order.upsert({ where: { orderNo: r.orderNo }, create: data, update: data });
      n++;
    }
  }
  report.push(['orders.jsonl', 'Order', rows.length, n]);
}

async function migrateAdmins() {
  const doc = readJson(path.join('admin', 'admins.json'));
  const rows = doc?.users ?? [];
  let n = 0;
  for (const r of rows) {
    const data = {
      id: r.id,
      email: r.email,
      passwordHash: r.passwordHash,
      name: r.name ?? null,
      role: r.role ?? 'operator',
      roleName: r.roleName ?? null,
      permissions: J(r.permissions ?? []),
      lastLoginAt: D(r.lastLoginAt),
      lastPasswordAt: D(r.lastPasswordAt),
      createdAt: D(r.createdAt) ?? new Date(),
    };
    if (WRITE) {
      await prisma.adminUser.upsert({ where: { email: r.email }, create: data, update: data });
      n++;
    }
  }
  report.push(['admin/admins.json', 'AdminUser', rows.length, n]);
}

async function migrateAudit() {
  const rows = readLines(path.join('admin', 'audit.jsonl'));
  let n = 0;
  for (const r of rows) {
    const createdAt = D(r.ts) ?? new Date();
    // 悬空引用置 null（历史审计可能指向已删除的管理员）
    let adminId = r.adminUserId ?? null;
    if (adminId && WRITE && !(await prisma.adminUser.findUnique({ where: { id: adminId } }))) adminId = null;
    const data = {
      adminUserId: adminId,
      action: r.action,
      target: r.target ?? null,
      meta: typeof r.meta === 'object' && r.meta !== null ? J(r.meta) : (r.meta ? String(r.meta) : null),
      createdAt,
    };
    if (WRITE) {
      // audit 无自然唯一键:按 ts+action+target 查重实现幂等
      const dup = await prisma.auditLog.findFirst({ where: { action: r.action, target: r.target ?? null, createdAt, adminUserId: adminId } });
      if (!dup) {
        await prisma.auditLog.create({ data });
        n++;
      }
    }
  }
  report.push(['admin/audit.jsonl', 'AuditLog', rows.length, n]);
}

async function migrateFollowups() {
  const rows = readJson(path.join('admin', 'followups.json')) ?? [];
  let n = 0;
  for (const r of rows) {
    const data = {
      id: r.id,
      customerKey: r.customerKey ?? r.email ?? null,
      status: r.status ?? 'pending',
      nextAt: D(r.nextAt),
      owner: r.owner ?? null,
      note: r.note ?? null,
      history: J(r.history ?? []),
      createdAt: D(r.createdAt) ?? new Date(),
      updatedAt: D(r.updatedAt) ?? new Date(),
    };
    if (WRITE) {
      await prisma.followUp.upsert({ where: { id: r.id }, create: data, update: data });
      n++;
    }
  }
  report.push(['admin/followups.json', 'FollowUp', rows.length, n]);
}

async function migrateImportedProducts() {
  const rows = readJson(path.join('admin', 'imported-products.json')) ?? [];
  let n = 0;
  for (const r of rows) {
    const data = {
      slug: String(r.h),
      sku: r.sku ? String(r.sku) : String(r.h),
      titleEn: r.t ?? String(r.h),
      basePriceUsd: Number(r.p) || 0,
      comparePriceUsd: r.c != null ? Number(r.c) : null,
      images: J(r.i ?? []),
      status: 'active',
      ext: J(r), // 短字段对象整体保真,K-S0-4 读路径以库+ext 为准
    };
    if (WRITE) {
      await prisma.product.upsert({ where: { slug: data.slug }, create: data, update: data });
      n++;
    }
  }
  report.push(['admin/imported-products.json', 'Product', rows.length, n]);
}

async function migrateImportBatches() {
  const rows = readJson(path.join('admin', 'import-batches.json')) ?? [];
  let n = 0;
  for (const r of rows) {
    const data = {
      id: r.id,
      folderName: r.folderName ?? '',
      fileCount: r.fileCount ?? 0,
      productCount: r.productCount ?? 0,
      status: r.status ?? 'parsed',
      log: J(r.failed ?? []),
      createdAt: D(r.createdAt) ?? new Date(),
    };
    if (WRITE) {
      await prisma.importBatch.upsert({ where: { id: r.id }, create: data, update: data });
      n++;
    }
  }
  report.push(['admin/import-batches.json', 'ImportBatch', rows.length, n]);
}

async function migrateMedia() {
  const rows = readJson(path.join('admin', 'media.json')) ?? [];
  let n = 0;
  for (const r of rows) {
    const data = {
      url: r.url,
      name: r.name ?? '',
      size: r.size ?? 0,
      source: r.source ?? null,
      uploadedAt: D(r.uploadedAt) ?? new Date(),
    };
    if (WRITE) {
      await prisma.mediaEntry.upsert({ where: { url: r.url }, create: data, update: data });
      n++;
    }
  }
  report.push(['admin/media.json', 'MediaEntry', rows.length, n]);
}

// ---------------- 回退导出 ----------------

async function exportBack() {
  const outDir = path.join(DATA, `export-back-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const write = (rel, obj) => {
    fs.writeFileSync(path.join(outDir, rel), rel.endsWith('.jsonl') ? obj.map((o) => JSON.stringify(o)).join('\n') + '\n' : JSON.stringify(obj, null, 2));
  };
  const users = await prisma.user.findMany();
  write('users.jsonl', users.map((u) => ({ id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash, phone: u.phone, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, ...JSON.parse(u.ext ?? '{}') })));
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'asc' } });
  write('orders.jsonl', orders.map((o) => {
    const addr = JSON.parse(o.address ?? '{}');
    const ext = JSON.parse(o.ext ?? '{}');
    return { orderNo: o.orderNo, email: o.email, name: addr.name, address: addr.address, city: addr.city, country: addr.country, zip: addr.zip, currency: o.currency, items: JSON.parse(o.items), subtotalUsd: o.subtotalUsd, discountUsd: o.discountUsd, shippingUsd: o.shippingUsd, totalUsd: o.totalUsd, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, fulfillmentStatus: o.fulfillmentStatus, shipment: ext.shipment, createdAt: o.createdAt, shippedAt: ext.shippedAt ?? null, phone: o.phone };
  }));
  const fus = await prisma.followUp.findMany();
  write('followups.json', fus.map((f) => ({ id: f.id, customerKey: f.customerKey, email: f.customerKey, status: f.status, nextAt: f.nextAt, owner: f.owner, note: f.note, history: JSON.parse(f.history ?? '[]') })));
  const admins = await prisma.adminUser.findMany();
  write('admins.json', { users: admins.map((a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, passwordHash: a.passwordHash, roleName: a.roleName, permissions: JSON.parse(a.permissions ?? '[]'), lastLoginAt: a.lastLoginAt, createdAt: a.createdAt })) });
  console.log('export-back →', outDir);
}

// ---------------- 入口 ----------------

(async () => {
  if (EXPORT_BACK) {
    await exportBack();
  } else {
    await migrateUsers();
    await migrateOrders();
    await migrateAdmins();
    await migrateAudit();
    await migrateFollowups();
    await migrateImportedProducts();
    await migrateImportBatches();
    await migrateMedia();
    console.log(`模式: ${WRITE ? 'WRITE(实迁)' : 'DRY-RUN(未写入)'}`);
    console.log('源文件 → 表 | 源行数 → 写入数');
    for (const [src, table, total, n] of report) console.log(`  ${src} → ${table} | ${total} → ${WRITE ? n : total}`);
    if (WRITE) {
      const counts = {};
      for (const t of ['user', 'order', 'adminUser', 'auditLog', 'followUp', 'product', 'importBatch', 'mediaEntry']) counts[t] = await prisma[t].count();
      console.log('DB 实际行数:', JSON.stringify(counts));
    }
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
