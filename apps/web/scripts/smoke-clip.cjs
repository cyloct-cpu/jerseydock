// 冒烟测试：transformers + 本地 CLIP 模型 + dHash
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const { pipeline, env } = require('@huggingface/transformers');
  env.allowLocalModels = true;
  env.localModelPath = path.resolve(__dirname, '..', 'models');
  env.useBrowserCache = false;

  console.log('loading model...');
  const t0 = Date.now();
  const extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' });
  console.log('model loaded in', Date.now() - t0, 'ms');

  const imgPath = path.resolve(__dirname, '..', '..', '..', 'data', 'search', 'test-img.jpg');
  const img = fs.readFileSync(imgPath);
  const t1 = Date.now();
  const out = await extractor(imgPath, { pooling: 'mean', normalize: true });
  console.log('embedding in', Date.now() - t1, 'ms, dims:', out.dims, 'data len:', out.data.length);
  const v = Array.from(out.data.slice(0, 5));
  console.log('first 5:', v.map(x => x.toFixed(4)).join(', '));
  const norm = Math.sqrt(out.data.reduce((s, x) => s + x * x, 0));
  console.log('vector norm (应≈1):', norm.toFixed(4));

  // dHash 测试
  const sharp = require('sharp');
  const { data, info } = await sharp(img).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  let hash = 0n;
  const bits = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits.push(left > right ? 1 : 0);
    }
  }
  for (const b of bits) hash = (hash << 1n) | BigInt(b);
  console.log('dHash(64bit):', hash.toString(16).padStart(16, '0'));
  console.log('SMOKE OK');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
