/**
 * 服务端机器翻译（免费 API 轮换 + 磁盘缓存）
 *
 * 免费翻译源（均无需 key，按顺序轮换，失败自动切下一个并冷却 10 分钟）：
 *   1. Google dict-chrome-ex — clients5.google.com 免费端点，质量最高
 *   2. MyMemory      — api.mymemory.translated.net，匿名 5000 字/天
 *   3. Google gtx    — translate.googleapis.com（部分服务器 IP 被拦，作兜底）
 *
 * 翻译结果按 locale 缓存到 data/mt-cache/{locale}.json，一次翻译永久复用，
 * 不消耗 API 配额；站点上新语种首次切换时自动批量补全全部 UI 文案。
 */
import fs from 'node:fs';
import path from 'node:path';

type MTResult = { text: string; source: string };

type Provider = {
  name: string;
  url: (text: string, target: string) => string;
  parse: (json: unknown) => string | null;
  /** MyMemory 等需要额外节流（毫秒/请求） */
  gap?: number;
};

const MT_PROVIDERS: Provider[] = [
  {
    name: 'google-chrome-ex',
    url: (text, tl) =>
      `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${tl}&q=${encodeURIComponent(text)}`,
    parse: json => {
      // 返回 ["译文"] 或 [["译文","en"]] 两种形态
      const arr = json as unknown[];
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const first = arr[0];
      if (typeof first === 'string') return first.trim() || null;
      if (Array.isArray(first) && typeof first[0] === 'string') return (first[0] as string).trim() || null;
      return null;
    },
    gap: 500,
  },
  {
    name: 'mymemory',
    url: (text, tl) =>
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${tl}`,
    parse: json => {
      const j = json as { responseData?: { translatedText?: string }; responseStatus?: number | string };
      const t = j?.responseData?.translatedText;
      if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) return null;
      return t;
    },
    gap: 300,
  },
  {
    name: 'lingva',
    url: (text, tl) => `https://lingva.ml/api/v1/auto/${tl}/${encodeURIComponent(text)}`,
    parse: json => (json as { translation?: string })?.translation || null,
    gap: 200,
  },
  {
    name: 'google-gtx',
    url: (text, tl) =>
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`,
    parse: json => {
      const arr = json as [Array<[string, string]>, ...unknown[]];
      if (!Array.isArray(arr?.[0])) return null;
      const out = (arr[0] as Array<[string, string]>).map(seg => seg?.[0] ?? '').join('');
      return out.trim() || null;
    },
    gap: 500,
  },
];

/* --- 失败冷却：某源连续失败后 10 分钟内跳过 --- */
const COOLDOWN_MS = 10 * 60 * 1000;
const cooldownUntil: Record<string, number> = {};

/* --- 每源请求节流：google 免费端点对突发高频连发会限流，按 gap 间隔打点 --- */
const lastReqAt: Record<string, number> = {};
async function throttle(name: string, gap?: number): Promise<void> {
  if (!gap) return;
  const wait = (lastReqAt[name] ?? 0) + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastReqAt[name] = Date.now();
}

/* --- 磁盘缓存（monorepo 根 data/mt-cache/，与其它数据文件同处） --- */
const CACHE_CANDIDATES = [
  path.resolve(process.cwd(), '..', '..', 'data', 'mt-cache'), // apps/web 运行
  path.resolve(process.cwd(), 'data', 'mt-cache'), // 根目录运行兜底
];
const CACHE_DIR = CACHE_CANDIDATES.find(d => fs.existsSync(path.dirname(d))) ?? CACHE_CANDIDATES[0];

function cachePath(locale: string): string {
  return path.join(CACHE_DIR, `${locale}.json`);
}

function loadCache(locale: string): Record<string, { src: string; out: string }> {
  try {
    return JSON.parse(fs.readFileSync(cachePath(locale), 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(locale: string, cache: Record<string, { src: string; out: string }>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(locale), JSON.stringify(cache, null, 1));
  } catch {
    // 缓存写失败不影响翻译返回
  }
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 单条文本翻译：按源轮换 */
export async function translateText(text: string, target: string): Promise<MTResult | null> {
  const now = Date.now();
  for (const p of MT_PROVIDERS) {
    if ((cooldownUntil[p.name] ?? 0) > now) continue;
    try {
      await throttle(p.name, p.gap);
      const json = await fetchJson(p.url(text, target));
      const out = p.parse(json);
      // 译文与原文相同 → 该源没翻出来（或原文即目标语），换下一源，避免把原文缓存成"译文"
      if (out && out !== text.trim()) return { text: out, source: p.name };
      throw new Error('empty result');
    } catch {
      cooldownUntil[p.name] = Date.now() + COOLDOWN_MS; // 冷却后其他源也挂了还能回来重试
    }
  }
  return null;
}

/* --- 商品内容翻译（标题 / 描述 / 分类名）：独立缓存 content-{locale}.json --- */
function contentCachePath(locale: string): string {
  return path.join(CACHE_DIR, `content-${locale}.json`);
}

function loadContentCache(locale: string): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(contentCachePath(locale), 'utf8')) as Record<string, string>;
    // 过滤历史污染条目（原文===译文的假翻译）
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (k !== v) clean[k] = v;
    return clean;
  } catch {
    return {};
  }
}

function saveContentCache(locale: string, cache: Record<string, string>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(contentCachePath(locale), JSON.stringify(cache, null, 1));
  } catch { /* 忽略写盘失败 */ }
}

/** 单条内容翻译（带缓存；locale=en 或原文为空直接原样返回） */
const HAS_CJK = /[一-鿿぀-ヿ가-힯]/;

export async function translateContent(text: string, locale: string): Promise<string> {
  const src = String(text || '').trim();
  // en 模式：纯英文无需翻译；含 CJK（主站同步商品标题）仍翻成英文
  if (!src || !locale || (locale === 'en' && !HAS_CJK.test(src))) return src;
  const cache = loadContentCache(locale);
  if (cache[src]) return cache[src];
  const r = await translateText(src, locale);
  const out = r?.text || src;
  if (out !== src) { cache[src] = out; saveContentCache(locale, cache); } // 原文===译文不入缓存
  return out;
}

/** 批量内容翻译（去重后逐条翻译并缓存） */
export async function translateContentBatch(texts: string[], locale: string): Promise<Record<string, string>> {
  const uniq = [...new Set(texts.map(t => String(t || '').trim()).filter(Boolean))];
  const cache = loadContentCache(locale);
  const out: Record<string, string> = {};
  for (const t of uniq) {
    if (cache[t]) { out[t] = cache[t]; continue; }
    out[t] = await translateContent(t, locale);
  }
  saveContentCache(locale, cache);
  return out;
}

export type FillResult = {
  dict: Record<string, string>;
  translated: number;
  source: string | null;
};

/* --- 占位符保护：{no} {n} {email} 等会被机翻当成英文单词（{no}→«нет»/{아니요}）---
 * 翻译前替换为 [[序号]] 标记（数字组合各源都会原样保留），翻译后还原；
 * 还原失败（标记丢失/被改写）则视为译文不可信，返回 null 换下一源。 */
const PLACEHOLDER_RE = /\{[a-z_][a-z_0-9]*\}/gi;

function protectPlaceholders(src: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = src.replace(PLACEHOLDER_RE, m => {
    tokens.push(m);
    return ` [[${tokens.length - 1}]] `;
  });
  return { text: text.trim(), tokens };
}

function restorePlaceholders(text: string, tokens: string[]): string | null {
  let out = text;
  for (let i = 0; i < tokens.length; i++) {
    const re = new RegExp(`\\[\\[\\s*${i}\\s*\\]\\]`, 'i');
    if (!re.test(out)) return null; // 标记被 MT 弄丢 → 不可信
    out = out.replace(re, tokens[i]);
  }
  return out;
}

/** 单条翻译（含占位符保护）；返回 null 表示该条本次未翻出 */
async function translateEntry(src: string, locale: string): Promise<MTResult | null> {
  if (!PLACEHOLDER_RE.test(src)) return translateText(src, locale);
  PLACEHOLDER_RE.lastIndex = 0;
  const p = protectPlaceholders(src);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await translateText(p.text, locale);
    if (!res) return null;
    const restored = restorePlaceholders(res.text, p.tokens);
    if (restored) return { text: restored, source: res.source };
    // 占位符被某源破坏 → 冷却该源后再试（translateText 内部已切源）
  }
  return null;
}

/**
 * 补全词典：把 en 中存在、locale 中缺失的 key 全部机翻（带磁盘缓存）。
 * 返回合并了机翻结果的完整词典（内置翻译优先，不被机翻覆盖）。
 */
export async function fillDictionary(
  locale: string,
  en: Record<string, string>,
  builtin: Record<string, string>,
  concurrency = 4,
): Promise<FillResult> {
  const cache = loadCache(locale);
  const missing = Object.keys(en).filter(k => builtin[k] == null && cache[k] == null);

  let translated = 0;
  let firstSource: string | null = null;

  // 并发受限地批量翻译
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < missing.length) {
      const key = missing[cursor++];
      const src = en[key];
      const res = await translateEntry(src, locale);
      if (res) {
        cache[key] = { src, out: res.text };
        if (!firstSource) firstSource = res.source;
        translated++;
      }
      if (translated && translated % 20 === 0) saveCache(locale, cache); // 中途落盘
      if (res?.source === 'mymemory') await sleep(300);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));

  if (translated > 0) saveCache(locale, cache);

  // 合并：内置 > 缓存机翻
  const dict: Record<string, string> = {};
  for (const [k, v] of Object.entries(cache)) dict[k] = v.out;
  return { dict, translated, source: firstSource };
}
