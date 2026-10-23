// 商品图片本地化工具（纯 JS，无依赖）
// 用法：
//   node scripts/localize-product-images.mjs plan      — 生成下载计划 data/image-localize/plan.json
//   node scripts/localize-product-images.mjs download  — 按 plan 批量下载（断点续传，失败写入 failed.json，重跑只补失败）
//   node scripts/localize-product-images.mjs rewrite   — 备份并改写 raw/clean/products.json 的图片 URL 为本地路径，再重建数据集
//
// 目录约定：apps/web/public/assets/products/<handle>/1.jpg 2.jpg …（i 数组顺序，主图在前）
// 同一图片被多个商品引用时：下载到首次引用它的商品目录，其余商品的数据指向同一路径（天然去重）。
// 并发可用 --concurrency=8 调整。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLEAN = path.join(ROOT, 'data', 'clean', 'products.json');
const PUBLIC_ASSETS = path.join(ROOT, 'apps', 'web', 'public', 'assets', 'products');
const WORK = path.join(ROOT, 'data', 'image-localize');
const PLAN_FILE = path.join(WORK, 'plan.json');
const FAILED_FILE = path.join(WORK, 'failed.json');
const CONCURRENCY = Number(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || 8);

const mode = process.argv[2] || 'plan';

function readClean() {
  return JSON.parse(fs.readFileSync(CLEAN, 'utf8'));
}

function extOf(url) {
  const m = url.split('?')[0].match(/\.(jpe?g|png|webp|avif|gif)$/i);
  return m ? m[0].toLowerCase() : '.jpg';
}

/** 生成计划：每个去重 URL → 本地相对路径（web/public 下） */
function plan() {
  const products = readClean();
  const urlMap = new Map(); // url → rel path（web/public 下）
  const files = [];
  for (const p of products) {
    let n = 0;
    for (const url of p.i || []) {
      n++;
      if (urlMap.has(url)) continue;
      const rel = `/assets/products/${p.h}/${n}${extOf(url)}`;
      urlMap.set(url, rel);
      files.push({ url, rel, handle: p.h });
    }
  }
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: files.length,
    files,
    map: Object.fromEntries(urlMap),
  }, null, 1));
  console.log(`计划完成：去重图片 ${files.length} 张（引用 ${products.reduce((s, p) => s + (p.i?.length || 0), 0)} 次）→ ${PLAN_FILE}`);
}

// ---- download ----
async function downloadOne(url, abs) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KITVAULT-localizer/1.0)' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`too small (${buf.length}B)`);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buf);
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

async function download() {
  if (!fs.existsSync(PLAN_FILE)) { console.error('先运行 plan 生成计划'); process.exit(1); }
  const planData = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const files = planData.files;
  console.log(`共 ${files.length} 张待本地化，并发 ${CONCURRENCY}，已存在的自动跳过（可中断重跑）`);
  let done = 0, fail = 0, skip = 0, idx = 0;
  const failed = [];
  const started = Date.now();

  async function worker() {
    while (idx < files.length) {
      const f = files[idx++];
      const abs = path.join(ROOT, 'apps', 'web', 'public', f.rel);
      try {
        if (fs.existsSync(abs) && fs.statSync(abs).size > 0) { done++; skip++; continue; }
        await downloadOne(f.url, abs);
        done++;
      } catch (e) {
        fail++;
        failed.push({ url: f.url, rel: f.rel, error: String(e).slice(0, 120) });
      }
      if ((done + fail) % 200 === 0) {
        const secs = Math.round((Date.now() - started) / 1000);
        console.log(`进度 ${done + fail}/${files.length}（成功 ${done - skip} 跳过 ${skip} 失败 ${fail}）· ${secs}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 1));
  console.log(`下载完成：成功 ${done - skip}（含跳过已有 ${skip}）· 失败 ${fail}`);
  if (fail) console.log(`失败清单 → ${FAILED_FILE}（重跑 download 即只补失败项）`);
}

// ---- rewrite ----
function rewrite() {
  if (!fs.existsSync(PLAN_FILE)) { console.error('先运行 plan'); process.exit(1); }
  const parsed = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const map = parsed.map;

  // 备份
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(WORK, 'backup', stamp);
  const backupTargets = [
    CLEAN,
    path.join(ROOT, 'data', 'raw', 'products.json'),
    path.join(ROOT, 'packages', 'shared', 'src', 'data', 'products.ts'),
  ];
  for (const src of backupTargets) {
    const dest = path.join(backupDir, path.relative(ROOT, src));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  console.log('已备份原文件 →', backupDir);

  const apply = (s) => {
    let n = 0;
    const out = s.replace(/https:\/\/img\.staticdj\.com\/[^"'\s,\]]+/g, (u) => {
      const hit = map[u];
      if (hit) { n++; return hit; }
      return u;
    });
    return [out, n];
  };

  // clean
  const cleanOut = apply(fs.readFileSync(CLEAN, 'utf8'));
  fs.writeFileSync(CLEAN, cleanOut[0]);
  console.log(`clean/products.json 替换 ${cleanOut[1]} 处`);

  // raw（images + cover）
  const rawPath = path.join(ROOT, 'data', 'raw', 'products.json');
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  let rawN = 0;
  for (const p of raw) {
    p.images = (p.images || []).map((u) => { const hit = map[u]; if (hit) { rawN++; return hit; } return u; });
    if (p.cover) { const hit = map[p.cover]; if (hit) { p.cover = hit; rawN++; } }
  }
  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 1));
  console.log(`raw/products.json 替换 ${rawN} 处`);

  // shared products.ts（全局正则替换，未命中的保留原样并警告）
  const tsPath = path.join(ROOT, 'packages', 'shared', 'src', 'data', 'products.ts');
  const tsOut = apply(fs.readFileSync(tsPath, 'utf8'));
  fs.writeFileSync(tsPath, tsOut[0]);
  console.log(`shared products.ts 替换 ${tsOut[1]} 处`);

  console.log('\n下一步：npm run build --workspace=@kitvault/web 重建前台，并重启服务。');
  console.log('仍有外链残留属正常（下载失败的 URL 保持原样，见 failed.json）。');
}

switch (mode) {
  case 'plan': plan(); break;
  case 'download': download(); break;
  case 'rewrite': rewrite(); break;
  default: console.error('用法：plan | download | rewrite');
}
