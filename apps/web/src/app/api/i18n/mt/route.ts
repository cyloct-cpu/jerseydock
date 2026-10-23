/**
 * POST /api/i18n/mt — 动态文本机翻（物流轨迹事件等不在 UI 词典里的文本）
 * 入参 { locale, texts: string[] }，返回 { map: { 源文本: 译文 } }
 * 译文按 locale 缓存到 data/mt-cache/events-{locale}.json，同一文本全站只翻一次。
 * 与 UI 词典（/api/i18n）互不影响；轨迹文本重复率极高，缓存命中后零翻译 API 消耗。
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { LOCALES, type Locale } from '@/lib/i18n';
import { translateText } from '@/lib/mt';

export const dynamic = 'force-dynamic';

const CACHE_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'mt-cache');
const MAX_TEXTS = 200;
const MAX_LEN = 500;

type EventCache = Record<string, string>;

function loadCache(locale: string): EventCache {
  try {
    return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `events-${locale}.json`), 'utf8')) as EventCache;
  } catch {
    return {};
  }
}

function saveCache(locale: string, cache: EventCache): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `events-${locale}.json`), JSON.stringify(cache), 'utf8');
  } catch { /* 缓存写失败不影响返回 */ }
}

export async function POST(req: NextRequest) {
  let body: { locale?: string; texts?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const locale = String(body.locale ?? '');
  if (locale === 'en') return NextResponse.json({ map: {} });
  if (!(LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'unsupported locale' }, { status: 400 });
  }
  const texts = (Array.isArray(body.texts) ? body.texts : [])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0 && t.length <= MAX_LEN)
    .slice(0, MAX_TEXTS);
  if (!texts.length) return NextResponse.json({ map: {} });

  const loc = locale as Locale;
  const cache = loadCache(loc);
  const map: Record<string, string> = {};
  let dirty = false;
  for (const src of texts) {
    const hit = cache[src];
    if (hit) { map[src] = hit; continue; }
    try {
      const r = await translateText(src, loc);
      if (r?.text) {
        cache[src] = r.text;
        map[src] = r.text;
        dirty = true;
      }
    } catch { /* 单条失败返回原文 */ }
  }
  if (dirty) saveCache(loc, cache);
  return NextResponse.json({ map });
}
