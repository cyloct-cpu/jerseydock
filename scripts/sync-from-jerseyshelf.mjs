#!/usr/bin/env node
/**
 * JERSEYDOCK ← jerseyshelf 商品同步消费端（主从同步，主库为 jerseyshelf）。
 *
 * 用法：
 *   node scripts/sync-from-jerseyshelf.mjs --base https://jerseyshelf.com --token <令牌> [--full] [--once]
 *
 * 行为：
 *   1. 增量拉取 /api/sync/catalog?cursor=…（--full 时全量快照），商品/分类写入 data/sync/catalog.jsonl（每实体最新一条）；
 *   2. 媒体按内容哈希落盘：优先命中共享图库目录 SYNC_SHARED_MEDIA_DIR（同机部署零复制），
 *      未命中按 URL 拉取并以 <hash>.<ext> 命名存入 data/media/——哈希寻址保证不重复占用硬盘；
 *   3. 游标存 data/sync/state.json；本店差异（价格系数/上下架）请写 overrides，不改写主数据。
 *
 * 定时接入：Windows 计划任务或 cron 每 10 分钟执行一次（默认增量）。
 * KITVAULT 落库（S0 完成）后，把 applyEntity() 换成数据库 upsert 即可，协议不变。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback = '') => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes('--' + name);

const base = (arg('base') || process.env.SYNC_BASE_URL || '').replace(/\/+$/, '');
const token = arg('token') || process.env.SYNC_TOKEN || '';
const dataDir = path.resolve(arg('data', 'data'));
const syncDir = path.join(dataDir, 'sync');
const mediaDir = path.resolve(arg('media', path.join(dataDir, 'media')));
const sharedMediaDir = process.env.SYNC_SHARED_MEDIA_DIR ? path.resolve(process.env.SYNC_SHARED_MEDIA_DIR) : '';
const full = flag('full');

if (!base || !token) {
  console.error('缺少 --base 或 --token（或环境变量 SYNC_BASE_URL / SYNC_TOKEN）');
  process.exit(1);
}
mkdirSync(syncDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

const stateFile = path.join(syncDir, 'state.json');
const catalogFile = path.join(syncDir, 'catalog.jsonl');
const readState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return { cursor: 0, applied: {} }; } };
const state = readState();

function fetchJson(url) {
  return fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' }).then(async r => {
    const body = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + body.slice(0, 200));
    return JSON.parse(body);
  });
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
async function ensureMedia(entry, publicBase) {
  if (!entry?.hash) return null;
  const ext = EXT[entry.contentType] || 'png';
  const name = entry.hash + '.' + ext;
  // 1) 已在本地媒体目录。
  if (existsSync(path.join(mediaDir, name))) return name;
  // 2) 同机共享图库：零复制直接命中（内容寻址同名）。
  if (sharedMediaDir) {
    for (const candidate of [entry.hash + '.' + ext, entry.hash + '.png', entry.hash + '.jpg', entry.hash + '.webp', entry.hash + '.gif']) {
      const shared = path.join(sharedMediaDir, candidate);
      if (existsSync(shared)) {
        if (candidate === name) return name;
        // 扩展名不同（主站登记的 content-type 与文件名后缀差异）：内容即真相，落本地标准名。
        writeFileSync(path.join(mediaDir, name), readFileSync(shared));
        return name;
      }
    }
  }
  // 3) 按 URL 拉取，哈希命名落盘；bytes 校验防截断。
  const url = publicBase + entry.path;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error('媒体拉取失败 HTTP ' + response.status + ': ' + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.hash) throw new Error('媒体哈希不一致：' + url + ' 期望 ' + entry.hash + ' 实际 ' + digest);
  if (entry.bytes && bytes.length !== entry.bytes) throw new Error('媒体大小不一致：' + url);
  writeFileSync(path.join(mediaDir, name), bytes);
  return name;
}

function readCatalogIndex() {
  // catalog.jsonl：每行一条最新实体；按 slug 键去重合并（后写覆盖）。
  const index = new Map();
  if (existsSync(catalogFile)) {
    for (const line of readFileSync(catalogFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const row = JSON.parse(line); index.set(row.payload.kind + ':' + row.key, row); } catch {}
    }
  }
  return index;
}
function writeCatalogIndex(index) {
  const lines = [...index.values()].map(row => JSON.stringify(row));
  writeFileSync(catalogFile, lines.join('\n') + '\n');
}

function applyEntity(change, publicBase) {
  // KITVAULT 落库后此函数替换为数据库 upsert；当前先落 jsonl 快照供导入与前端静态数据比对。
  return { key: change.payload.slug, slug: change.payload.slug };
}

async function main() {
  console.log('同步开始：base=' + base + ' mode=' + (full ? 'full' : 'increment') + ' cursor=' + state.cursor);
  const url = base + '/api/sync/catalog?' + new URLSearchParams({ token, ...(full ? { full: '1' } : { cursor: String(state.cursor), limit: '500' }) });
  const data = await fetchJson(url);
  const index = readCatalogIndex();
  let applied = 0, skipped = 0, mediaNew = 0;
  for (const change of data.changes) {
    const payload = change.payload;
    const before = index.get(payload.kind + ':' + payload.slug);
    if (before?.payload.contentHash === payload.contentHash) { skipped++; continue; }
    // 媒体落盘：把 images[].path 替换为本地文件名（含共享目录命中）。
    for (const image of payload.images || []) {
      if (!image) continue;
      const beforeName = image.localName;
      const name = await ensureMedia(image, data.publicBase || base);
      if (name && name !== beforeName) mediaNew++;
      image.localName = name;
    }
    if (payload.kind === 'collection' && payload.image) {
      payload.image.localName = await ensureMedia(payload.image, data.publicBase || base);
    }
    index.set(payload.kind + ':' + payload.slug, { seq: change.seq, key: payload.slug, payload, syncedAt: new Date().toISOString() });
    applied++;
  }
  writeCatalogIndex(index);
  if (data.cursor > state.cursor || full) {
    state.cursor = data.cursor;
    state.updatedAt = new Date().toISOString();
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  }
  console.log(`同步完成：应用 ${applied}（媒体新取 ${mediaNew}），内容未变跳过 ${skipped}，游标 ${state.cursor}/${data.latest}`);
  if (!flag('once') === false) { /* --once 仅为语义占位：脚本天然单次执行 */ }
}

main().catch(err => { console.error('同步失败：' + (err.message || err)); process.exit(1); });
