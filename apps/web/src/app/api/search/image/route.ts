import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { allProducts, isActive } from '@/lib/catalog';
import { searchByImage, textSearchProducts } from '@/lib/image-search';
import { describeImage, attrsToKeywords } from '@/lib/vision-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const IMG_EXTS = /\.(jpe?g|png|webp|avif)$/i;
const CLIP_THRESHOLD = 0.82;
const TOP_K = 12;

/** 简单内存限流：每 IP 每分钟 10 次（推理有成本，防刷） */
const buckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  buckets.set(ip, arr);
  if (buckets.size > 5000) buckets.clear();
  return arr.length > 10;
}

/** 后台配置的视觉 API keys（settings.json → visionApi.keys，每行 "groq:gsk_..."） */
function loadVisionKeys(): string | null {
  try {
    const file = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json');
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const keys = s?.visionApi?.keys;
    return typeof keys === 'string' && keys.trim() ? keys : null;
  } catch {
    return null;
  }
}

/**
 * 以图搜款：POST /api/search/image  (multipart: file)
 * 流程：上传校验 → pHash 快通道 + CLIP 语义检索 → 低于阈值走视觉 API 兜底
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: '请求太频繁，请稍后再试' }, { status: 429 });
  }

  let buf: Buffer;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(typeof File !== 'undefined' && file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: '未选择文件' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: '图片超过 5MB' }, { status: 400 });
    }
    if (!IMG_EXTS.test(file.name)) {
      return NextResponse.json({ ok: false, error: '仅支持 jpg / png / webp / avif' }, { status: 400 });
    }
    buf = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ ok: false, error: '请求格式错误' }, { status: 400 });
  }

  try {
    const products = allProducts().filter(isActive);
    const byHandle = new Map(products.map(p => [p.h, p]));

    // 主通道：pHash 快通道 + CLIP
    const res = await searchByImage(buf, byHandle, { threshold: CLIP_THRESHOLD, topK: TOP_K });

    if (res.hits.length) {
      return NextResponse.json({
        ok: true,
        source: 'clip',
        hits: res.hits,
        best: res.best,
        fastHits: res.fastHits,
      });
    }

    // C 通道：CLIP 无置信结果 → 视觉 API 提取属性 → 文本检索
    const visionKeys = loadVisionKeys();
    if (visionKeys) {
      const attrs = await describeImage(buf, visionKeys);
      if (attrs && !(attrs.keywords || []).includes('not-a-jersey')) {
        const matched = textSearchProducts(attrsToKeywords(attrs), products, TOP_K);
        if (matched.length) {
          return NextResponse.json({
            ok: true,
            source: 'vision',
            hits: matched.map(m => ({ product: m.product, score: 0.8, exact: false })),
            best: 0.8,
            fastHits: 0,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, source: 'none', hits: [], best: res.best, fastHits: 0 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '搜索失败，请重试' },
      { status: 500 },
    );
  }
}
