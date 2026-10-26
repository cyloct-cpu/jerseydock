// K-S0-4:数据集种子入库——data/clean/products.json(3736 件)→ Product 表
// 幂等(upsert by slug);ext 带 src:'dataset' 标记,与导入域(ext 无 src)区分。
// 新环境部署时跑一次:node scripts/seed-dataset.mjs --write(dry-run 默认)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');
const DB_PATH = path.join(ROOT, 'packages', 'db', 'prisma', 'dev.db');
const DATASET = path.join(ROOT, 'data', 'clean', 'products.json');

const rows = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
const list = rows.filter(p => p.h);
const db = new DatabaseSync(DB_PATH);

const count = db.prepare("SELECT COUNT(*) c FROM Product WHERE json_extract(ext,'$.src')='dataset'").get().c;
console.log(`数据集:${list.length} 件(库中 dataset 域现有 ${count})${WRITE ? ' → WRITE' : ' → DRY-RUN'}`);
if (!WRITE) process.exit(0);

const ins = db.prepare(`INSERT INTO Product (id,sku,slug,titleEn,basePriceUsd,comparePriceUsd,images,status,ext,createdAt,updatedAt)
  VALUES (lower(hex(randomblob(12))),?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(slug) DO UPDATE SET sku=excluded.sku, titleEn=excluded.titleEn, basePriceUsd=excluded.basePriceUsd,
  comparePriceUsd=excluded.comparePriceUsd, images=excluded.images, ext=excluded.ext, updatedAt=excluded.updatedAt`);
const now = new Date().toISOString();
db.exec('BEGIN');
try {
  for (const p of list) {
    const slug = String(p.h);
    ins.run(
      p.sku ? String(p.sku) : slug,
      slug,
      p.t ?? slug,
      Number(p.p) || 0,
      p.c != null ? Number(p.c) : null,
      JSON.stringify(p.i ?? []),
      'active',
      JSON.stringify({ ...p, src: 'dataset' }),
      now,
      now,
    );
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
console.log('入库完成:', db.prepare("SELECT COUNT(*) c FROM Product WHERE json_extract(ext,'$.src')='dataset'").get().c, '| 全表:', db.prepare('SELECT COUNT(*) c FROM Product').get().c);
