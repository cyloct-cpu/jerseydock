/**
 * 种子数据（npm run db:seed --workspace=@kitvault/db）
 * 1) 分类树：来自 data/raw/collection-map.json（采集站 138 个集合）
 * 2) 汇率：frankfurter 失败时的内置回退值（与 packages/shared/src/currency.ts 一致）
 * 3) 演示管理员：owner@kitvault.local / admin123（首次登录后请立即修改）
 *
 * 商品不入库：3736 件采集商品由前台静态数据集（@kitvault/shared）提供，
 * 接入数据库后通过同一导入流水线写入（见开发执行文档 §6.3）。
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const prisma = new PrismaClient();

// 集合 slug → 分类类型（与 packages/shared/src/data/products.ts 的 CATEGORY_GROUPS 对齐）
const GROUP_OF: Record<string, string> = {
  '2026-27-season': 'season', '2025-26-season': 'season', '2024-25-season': 'season',
  retro: 'retro', 'kids-size': 'kids', 'autumn-and-winter-series': 'outerwear', 'shorts-f9eg': 'shorts',
};
const NATIONS = new Set([
  'germany', 'france', 'portugal', 'belgium', 'denmark', 'england', 'spain', 'wales', 'turkiye',
  'switzerland', 'italy', 'netherlands', 'croatia', 'sweden', 'finland', 'ireland', 'poland',
  'america', 'argentina', 'jamaica', 'uruguay', 'brazil', 'paraguay', 'chile', 'colombia',
  'peru', 'mexico', 'usa', 'canada', 'japan', 'korea', 'china', 'australia', 'nigeria',
  'cameroon', 'ghana', 'egypt', 'morocco', 'senegal', 'ivory-coast', 'algeria', 'tunisia',
  'norway', 'austria', 'scotland', 'northern-ireland', 'russia', 'ukraine', 'czech', 'greece',
  'serbia', 'slovakia', 'slovenia', 'romania', 'hungary', 'bosnia',
]);
const CLUBS = new Set([
  'manchester-united', 'arsenal', 'liverpool', 'paris', 'ac-milan', 'real-madrid', 'bayern',
  'inter-milan', 'chelsea', 'barcelona', 'juventus', 'manchester-city', 'tottenham',
  'atletico-madrid', 'marseille', 'real-betis', 'dortmund', 'ajax', 'celtic', 'benfica',
  'santos', 'boca-juniors', 'aston-villa', 'newcastle', 'west-ham', 'everton', 'leicester',
  'roma', 'napoli', 'lazio', 'porto', 'sporting', 'psv', 'feyenoord', 'lyon', 'monaco',
  'leverkusen', 'leipzig', 'schalke', 'valencia', 'sevilla', 'villareal', 'flamengo',
  'corinthians', 'river-plate', 'gremio', 'palmeiras', 'sao-paulo',
]);

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map(w => (w.length <= 3 && /^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function categoryType(slug: string): string {
  if (GROUP_OF[slug]) return GROUP_OF[slug];
  if (NATIONS.has(slug)) return 'national';
  if (CLUBS.has(slug)) return 'club';
  return 'other';
}

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

async function main() {
  // 1) 分类
  const mapPath = path.join(ROOT, 'data', 'raw', 'collection-map.json');
  let map: Record<string, number> = {};
  try {
    map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  } catch {
    console.warn('[seed] collection-map.json 不存在，跳过分类种子（可先运行 npm run scrape）');
  }
  const entries = Object.entries(map).filter(([, n]) => n > 0);
  for (const [slug, count] of entries) {
    await prisma.category.upsert({
      where: { slug },
      update: { nameEn: titleFromSlug(slug), type: categoryType(slug) },
      create: {
        slug,
        nameEn: titleFromSlug(slug),
        type: categoryType(slug),
        sort: count,
      },
    });
  }
  console.log(`[seed] categories: ${entries.length}`);

  // 2) 汇率回退值
  const rates: Record<string, number> = { EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52, JPY: 152, BRL: 5.45 };
  for (const [quote, rate] of Object.entries(rates)) {
    await prisma.exchangeRate.upsert({
      where: { base_quote: { base: 'USD', quote } },
      update: { rate },
      create: { base: 'USD', quote, rate },
    });
  }
  console.log(`[seed] exchange rates: ${Object.keys(rates).length}`);

  // 3) 演示管理员
  const email = 'owner@kitvault.local';
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: hashPassword('admin123'), name: 'Owner', role: 'owner' },
  });
  console.log('[seed] admin user: owner@kitvault.local / admin123（请登录后立即修改）');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
