// K-S2 联调用 mock 主站:模拟 jerseyshelf /api/sync/catalog 出口(开发执行文档 §12.3 协议)
// 用法:node scripts/mock-master-sync.mjs [port=4599]
// 控制:POST /__control {"mode":"live"|"delete"} 切换数据集(delete 模式追加 A 的 tombstone)
// 鉴权:Bearer dev-sync-token;媒体由本进程 /media-files/<hash>.jpg 提供
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.argv[2]) || 4599;
const TOKEN = 'dev-sync-token';

// 两张"假 JPEG"(真实 JPEG 头,内容不同 → hash 不同)
function fakeJpeg(seed) {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const body = Buffer.from(`mock-media-${seed}-${'x'.repeat(500)}`);
  return Buffer.concat([head, body]);
}
const imgA = fakeJpeg('a');
const imgB = fakeJpeg('b');
const hA = crypto.createHash('sha256').update(imgA).digest('hex');
const hB = crypto.createHash('sha256').update(imgB).digest('hex');

const productA = (price, hash) => ({
  slug: 'sync-test-a',
  titleEn: 'Sync Test Jersey A',
  description: 'Mock product A for sync testing',
  basePriceUsd: price,
  comparePriceUsd: 45,
  sizes: ['S', 'M', 'L'],
  collections: ['sync-test'],
  status: 'active',
  customization: { textOn: true, armbandOn: false, textFeeUsd: 3 },
  media: [{ hash: hA, ext: 'jpg', bytes: imgA.length, url: `http://127.0.0.1:${PORT}/media-files/${hA}.jpg` }],
});
const productB = {
  slug: 'sync-test-b',
  titleEn: 'Sync Test Jersey B',
  description: 'Mock product B for sync testing',
  basePriceUsd: 40,
  comparePriceUsd: null,
  sizes: ['M', 'L', 'XL'],
  collections: ['sync-test'],
  status: 'active',
  media: [{ hash: hB, ext: 'jpg', bytes: imgB.length, url: `http://127.0.0.1:${PORT}/media-files/${hB}.jpg` }],
};

let mode = 'live'; // live | delete
let entries = [
  { seq: 1, op: 'upsert', contentHash: 'hash-a-v1', product: productA(33, 'hash-a-v1') },
  { seq: 2, op: 'upsert', contentHash: 'hash-b-v1', product: productB },
  { seq: 3, op: 'upsert', contentHash: 'hash-a-v2', product: productA(29, 'hash-a-v2') },
];

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'POST' && u.pathname === '/__control') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body || '{}');
      if (j.mode === 'delete' && !entries.some(e => e.seq === 4)) {
        entries.push({ seq: 4, op: 'delete', contentHash: 'hash-a-v3-deleted', product: { ...productA(29, 'x'), status: 'archived' } });
      }
      mode = j.mode || mode;
      res.end(JSON.stringify({ ok: true, mode, entries: entries.length }));
    });
    return;
  }
  if (u.pathname.startsWith('/media-files/')) {
    const name = u.pathname.split('/').pop();
    const buf = name.startsWith(hA) ? imgA : name.startsWith(hB) ? imgB : null;
    if (!buf) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(buf);
    return;
  }
  if (u.pathname === '/api/sync/catalog') {
    if ((req.headers.authorization || '') !== `Bearer ${TOKEN}`) { res.writeHead(401); res.end('{"error":"unauthorized"}'); return; }
    const cursor = Number(u.searchParams.get('cursor') || 0);
    const limit = Math.min(200, Number(u.searchParams.get('limit') || 200));
    const page = entries.filter(e => e.seq > cursor).slice(0, limit);
    const last = page.length ? page[page.length - 1].seq : cursor;
    const nextCursor = entries.length && last < entries[entries.length - 1].seq ? last : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ entries: page, nextCursor }));
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`mock master on http://127.0.0.1:${PORT} (mode=${mode}, entries=${entries.length}, mediaHashes=${hA.slice(0, 8)}/${hB.slice(0, 8)})`));
