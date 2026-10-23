// 全量采集 chenyikan.shop 商品数据
// 数据源：集合页 HTML 提取 collection uuid → /api/collections/{uuid}/cps?limit=250&page=N
// 用法：node scripts/scrape-chenyikan.mjs
// 产出：data/raw/products.json | products.csv | image-urls.txt | collection-map.json | collection-ids.txt

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const BASE = 'https://www.chenyikan.shop';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const CONC = 5;
const LIMIT = 250;
const MAX_PAGE = 60;

fs.mkdirSync(RAW, { recursive: true });
const slugs = fs.readFileSync(path.join(RAW, 'collections.txt'), 'utf8')
  .split('\n').map(s => s.trim()).filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const absUrl = u => !u ? '' : u.startsWith('//') ? 'https:' + u : u;

async function get(url, json = true, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html' } });
      if (!res.ok) return null;
      return json ? await res.json() : await res.text();
    } catch { await sleep(700 * (i + 1)); }
  }
  return null;
}

async function resolveId(slug) {
  const html = await get(`${BASE}/collections/${slug}`, false);
  if (!html) return null;
  const m = html.match(/collections\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

function normalize(p, collSlugs) {
  const imgs = (p.images || []).map(i => absUrl(i.src || i.url)).filter(Boolean);
  const cover = absUrl((p.image || {}).src) || imgs[0] || '';
  const sizeOpt = (p.options || []).find(o => /size|尺码/i.test(o.name || ''));
  return {
    id: p.id || '',
    handle: p.handle || '',
    title: (p.title || '').trim(),
    url: p.url ? BASE + p.url : `${BASE}/products/${p.handle}`,
    price: num(p.price),
    priceMin: num(p.price_min),
    priceMax: num(p.price_max),
    comparePrice: num(p.compare_at_price),
    offRatio: num(p.off_ratio),
    sku: p.spu || '',
    sizes: sizeOpt ? sizeOpt.values : [],
    variantCount: num(p.variants_count ?? (p.variants || []).length),
    variants: (p.variants || []).map(v => ({
      id: v.id, title: v.title, option1: v.option1,
      price: num(v.price), comparePrice: num(v.compare_at_price),
      available: !!v.available, stock: num(v.inventory_quantity),
    })),
    images: imgs,
    cover,
    sales: num(p.sales ?? p.fake_sales),
    tags: String(p.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    productType: p.product_type || '',
    description: String(p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000),
    collections: collSlugs,
  };
}

async function main() {
  console.log(`[1/2] 解析 ${slugs.length} 个集合的 ID…`);
  const ids = new Map();
  for (let i = 0; i < slugs.length; i += CONC) {
    const batch = slugs.slice(i, i + CONC);
    const rs = await Promise.all(batch.map(async s => [s, await resolveId(s)]));
    rs.forEach(([s, id]) => { if (id) ids.set(s, id); });
    process.stdout.write(`\r[1/2] ${Math.min(i + CONC, slugs.length)}/${slugs.length} · 已解析 ${ids.size}      `);
    await sleep(100);
  }
  console.log('');
  fs.writeFileSync(path.join(RAW, 'collection-ids.txt'),
    [...ids].map(([s, id]) => `${s} ${id}`).join('\n'), 'utf8');

  console.log(`[2/2] 抓取商品（${ids.size} 个集合）…`);
  const byId = new Map();
  const collMap = {};
  let n = 0;
  for (const [slug, id] of ids) {
    let count = 0;
    for (let page = 1; page <= MAX_PAGE; page++) {
      const d = await get(`${BASE}/api/collections/${id}/cps?limit=${LIMIT}&page=${page}`);
      const ps = d?.data?.products;
      if (!Array.isArray(ps) || ps.length === 0) break;
      for (const p of ps) {
        if (!p?.id) continue;
        const ex = byId.get(p.id);
        if (ex) { if (!ex.collections.includes(slug)) ex.collections.push(slug); }
        else byId.set(p.id, normalize(p, [slug]));
        count++;
      }
      if (d?.data?.has_more === false || ps.length < LIMIT) break;
      await sleep(80);
    }
    collMap[slug] = count;
    n++;
    process.stdout.write(`\r[2/2] ${n}/${ids.size} 集合 · 商品 ${byId.size}      `);
  }
  console.log('');

  const list = [...byId.values()];
  fs.writeFileSync(path.join(RAW, 'products.json'), JSON.stringify(list, null, 2), 'utf8');

  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['handle', 'title', 'price', 'compare_price', 'off_ratio', 'sku', 'sizes', 'collections', 'cover', 'images', 'url'];
  const csv = [head.join(',')].concat(list.map(p => [
    p.handle, p.title, p.price, p.comparePrice, p.offRatio, p.sku, (p.sizes || []).join('|'),
    (p.collections || []).join('|'), p.cover, (p.images || []).join('|'), p.url,
  ].map(q).join(','))).join('\n');
  fs.writeFileSync(path.join(RAW, 'products.csv'), csv, 'utf8');

  const urls = [...new Set(list.flatMap(p => p.images))];
  fs.writeFileSync(path.join(RAW, 'image-urls.txt'), urls.join('\n'), 'utf8');
  fs.writeFileSync(path.join(RAW, 'collection-map.json'), JSON.stringify(collMap, null, 2), 'utf8');

  const withImg = list.filter(p => p.images.length).length;
  console.log(`[完成] 商品 ${list.length} 件 · 有图 ${withImg} 件 · 图片 ${urls.length} 张`);
  console.log(`[产出] data/raw/ products.json / products.csv / image-urls.txt / collection-map.json`);
}

main().catch(e => { console.error('[失败]', e); process.exit(1); });
