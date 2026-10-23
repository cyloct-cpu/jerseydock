// 调试：复现索引构建中单张图的完整处理链路
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const sharp = require('sharp');
  const { pipeline, env, RawImage } = require('@huggingface/transformers');
  env.allowLocalModels = true;
  env.localModelPath = path.resolve(__dirname, '..', 'models');
  env.useBrowserCache = false;

  const url = 'https://img.staticdj.com/b1a8b778d98edbf16a0e61939a84252f.jpg';
  console.log('1) fetch...');
  let buf = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('   status:', res.status, 'ct:', res.headers.get('content-type'));
    buf = Buffer.from(await res.arrayBuffer());
    console.log('   bytes:', buf.length);
  } catch (e) {
    console.log('   FETCH FAILED:', e.message);
    process.exit(1);
  }

  console.log('2) sharp decode (bufferToRawImage path)...');
  try {
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    console.log('   meta:', meta.width, 'x', meta.height, 'channels:', meta.channels, 'format:', meta.format);
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log('   raw:', info.width, 'x', info.height, 'ch:', info.channels);
  } catch (e) {
    console.log('   SHARP FAILED:', e.message);
  }

  console.log('3) dHash...');
  try {
    const { data } = await sharp(buf, { failOn: 'none' }).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
    let hash = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | BigInt(data[y * 9 + x] > data[y * 9 + x + 1] ? 1 : 0);
    console.log('   dHash:', hash.toString(16));
  } catch (e) {
    console.log('   DHASH FAILED:', e.message);
  }

  console.log('4) embed via RawImage...');
  try {
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    const p = longest > 1024 ? img.resize(1024, null, { withoutEnlargement: true }) : img;
    const { data, info } = await p.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels < 3 ? 1 : 3);
    const extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' });
    const out = await extractor(raw, { pooling: 'mean', normalize: true });
    console.log('   dims:', out.dims, 'len:', out.data.length);
  } catch (e) {
    console.log('   EMBED FAILED:', e.message);
    console.log(e.stack?.split('\n').slice(0, 5).join('\n'));
  }
  console.log('DEBUG DONE');
})().catch(e => { console.error('OUTER FAIL:', e); process.exit(1); });
