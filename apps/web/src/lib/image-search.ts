/**
 * 以图搜款核心库（需求：视觉搜索）
 * - CLIP ViT-B/32（q8 量化，本地模型 apps/web/models/）→ 512 维语义向量
 * - dHash 64 位指纹 → 相同/近似相同图快通道
 * - 余弦相似度 top-K（向量已 L2 归一化，点积即余弦）
 * - 目录文本检索（C 通道：视觉模型提取属性后按关键词匹配）
 *
 * 仅服务端使用（route handler runtime=nodejs）；动态 import 原生依赖，
 * 避免进入客户端包。next.config.mjs 已将三个原生包列入 serverExternalPackages。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { SlimProduct } from '@kitvault/shared';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const DATA_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'search');
const INDEX_PATH = path.join(DATA_DIR, 'image-vectors.json');

/** 向量索引记录（v/d 体积控制：向量保留 4 位小数） */
export type VectorRecord = {
  /** 商品 handle */
  h: string;
  /** 主图 URL */
  u: string;
  /** URL 指纹（判断主图是否变更，支持增量重建） */
  sig: string;
  /** 512 维归一化向量 */
  v: number[];
  /** dHash（16 位 hex） */
  d: string;
  /** 入库时间 */
  at: string;
};

export type SearchHit = {
  product: SlimProduct;
  score: number;
  exact: boolean;
};

export type ImageSearchResult = {
  hits: SearchHit[];
  best: number;
  /** 快通道命中数（pHash 距离 ≤ 5） */
  fastHits: number;
};

// ---------------- 模型单例 ----------------

type Extractor = (input: unknown, opts?: Record<string, unknown>) => Promise<{ data: Float32Array | number[] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = true;
      env.localModelPath = path.resolve(process.cwd(), 'models');
      env.useBrowserCache = false;
      return pipeline('image-feature-extraction', MODEL_ID, { dtype: 'q8' }) as unknown as Promise<Extractor>;
    })();
  }
  return extractorPromise;
}

/** L2 归一化（transformers 的 normalize 选项在 q8 模型上不生效，手动兜底） */
function l2normalize(arr: ArrayLike<number>): number[] {
  const out = Array.from(arr, Number);
  let norm = 0;
  for (const x of out) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < out.length; i++) out[i] = out[i] / norm;
  return out;
}

/** 图片 Buffer → transformers RawImage（Node 端 Buffer 不被直接接受） */
async function bufferToRawImage(buf: Buffer): Promise<unknown> {
  const { RawImage } = await import('@huggingface/transformers');
  // 限制最长边 1024：CLIP 内部还会缩到 224，提前缩小可省内存与解码时间
  const img = sharp(buf, { failOn: 'none' });
  const meta = await img.metadata();
  const longest = Math.max(meta.width || 0, meta.height || 0);
  const pipelineImg = longest > 1024 ? img.resize(1024, null, { withoutEnlargement: true }) : img;
  const { data, info } = await pipelineImg.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels < 3 ? 1 : 3);
}

/** 任意来源（URL / Buffer）→ 512 维归一化向量 */
export async function embedImage(input: string | Buffer): Promise<number[]> {
  const extractor = await getExtractor();
  let src: unknown = input;
  if (Buffer.isBuffer(input)) src = await bufferToRawImage(input);
  const out = await extractor(src, { pooling: 'mean', normalize: true });
  return l2normalize(out.data);
}

// ---------------- dHash ----------------

/** 64 位差异哈希（9×8 灰度，相邻像素比较）——相同图的压缩/缩放变体距离≈0 */
export async function dHash(input: string | Buffer): Promise<string> {
  const { data } = await sharp(input, { failOn: 'none' })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | BigInt(data[y * 9 + x] > data[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

/** 两个 dHash 的汉明距离（0-64） */
export function hamming(a: string, b: string): number {
  const x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  let v = x;
  while (v) {
    n += Number(v & 1n);
    v >>= 1n;
  }
  return n;
}

/** 余弦相似度（向量已归一化，即点积） */
export function cosine(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

// ---------------- 索引读写 ----------------

export function readIndex(): VectorRecord[] {
  try {
    const arr = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    return Array.isArray(arr) ? (arr as VectorRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeIndex(records: VectorRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = INDEX_PATH + '.tmp';
  // 向量量化到 4 位小数，索引体积约减 60%
  const slim = records.map(r => ({ ...r, v: r.v.map(x => Math.round(x * 10000) / 10000) }));
  fs.writeFileSync(tmp, JSON.stringify(slim), 'utf8');
  fs.renameSync(tmp, INDEX_PATH);
}

/** URL 指纹：主图变更检测（增量重建用） */
export function urlSig(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------------- 检索 ----------------

/**
 * 以图搜款主入口
 * - pHash 快通道：距离 ≤ 5 视为相同图，直接置顶（exact）
 * - CLIP 通道：余弦相似度，默认阈值 0.82
 * - 两路结果合并去重，快通道命中优先
 */
export async function searchByImage(
  buf: Buffer,
  products: Map<string, SlimProduct>,
  opts: { topK?: number; threshold?: number } = {},
): Promise<ImageSearchResult> {
  const topK = opts.topK ?? 12;
  const threshold = opts.threshold ?? 0.82;

  const [vec, dh] = await Promise.all([embedImage(buf), dHash(buf)]);
  const index = readIndex();

  const scored: { rec: VectorRecord; score: number; exact: boolean }[] = [];
  let fastHits = 0;
  for (const rec of index) {
    const dist = hamming(dh, rec.d);
    const exact = dist <= 5;
    if (exact) fastHits++;
    const cos = cosine(vec, rec.v);
    // exact 永远排前；同组内（含 exact 之间）按 CLIP 余弦细分，
    // 避免版式相似的图片（如训练背心）被 pHash 误判同款时顺序随机
    const score = exact ? 1 + cos * 0.001 : cos;
    scored.push({ rec, score, exact });
  }
  scored.sort((a, b) => b.score - a.score);

  const hits: SearchHit[] = [];
  for (const s of scored) {
    if (!s.exact && s.score < threshold) break;
    const product = products.get(s.rec.h);
    if (!product) continue; // 索引里有但目录已无此商品
    hits.push({ product, score: Math.round(s.score * 1000) / 1000, exact: s.exact });
    if (hits.length >= topK) break;
  }
  return { hits, best: scored.length ? scored[0].score : 0, fastHits };
}

// ---------------- 文本检索（C 通道用） ----------------

/** 关键词 → 商品匹配（标题/分类分词包含匹配，命中关键词多者优先） */
export function textSearchProducts(
  keywords: string[],
  products: SlimProduct[],
  limit = 12,
): { product: SlimProduct; matched: number }[] {
  const kws = keywords.map(k => k.toLowerCase().trim()).filter(k => k.length >= 2);
  if (!kws.length) return [];
  const scored: { product: SlimProduct; matched: number }[] = [];
  for (const p of products) {
    const hay = `${p.t} ${p.cl.join(' ')}`.toLowerCase();
    let matched = 0;
    for (const k of kws) if (hay.includes(k)) matched++;
    if (matched > 0) scored.push({ product: p, matched });
  }
  scored.sort((a, b) => b.matched - a.matched || b.product.sa - a.product.sa);
  return scored.slice(0, limit);
}

/** 抓取远程图片（索引构建用）：超时 + 一次重试 */
export async function fetchImageBuffer(url: string, timeoutMs = 15000): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timer);
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (ct && !/image\//.test(ct)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024 || buf.length > 12 * 1024 * 1024) return null;
      return buf;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

export const SEARCH_PATHS = { DATA_DIR, INDEX_PATH };
