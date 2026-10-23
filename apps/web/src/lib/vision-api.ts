/**
 * 视觉 API 兜底通道（C 通道）
 * CLIP 匹配置信度不足时，把图片交给视觉大模型提取球衣属性（球队/赛季/颜色/款式），
 * 再走目录文本检索。仿 lib/mt.ts 的免费 API 轮换模式：
 * - 多 Provider 轮换，失败冷却 10 分钟，磁盘缓存（data/search/vision-cache.json）
 * - Provider 均为 OpenAI 兼容 chat/completions 接口，key 在后台「商店设置」配置
 *
 * 仅在服务端使用；未配置任何 key 时静默跳过（不影响 CLIP 主通道）。
 */
import fs from 'node:fs';
import path from 'node:path';

const CACHE_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'search', 'vision-cache.json');
const COOLDOWN_MS = 10 * 60 * 1000;

export type VisionProviderType = 'groq' | 'openrouter' | 'huggingface';

type ProviderDef = {
  type: VisionProviderType;
  endpoint: string;
  defaultModel: string;
  label: string;
};

const PROVIDERS: Record<VisionProviderType, ProviderDef> = {
  groq: {
    type: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Groq（免费额度）',
  },
  openrouter: {
    type: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'qwen/qwen2.5-vl-72b-instruct:free',
    label: 'OpenRouter（免费模型）',
  },
  huggingface: {
    type: 'huggingface',
    endpoint: 'https://router.huggingface.co/v1/chat/completions',
    defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct',
    label: 'HuggingFace（免费额度）',
  },
};

/** 解析设置里的 key 列表（格式 "groq:gsk_xxx"，每行一个） */
export function parseVisionKeys(raw: string): { type: VisionProviderType; key: string }[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const idx = l.indexOf(':');
      const type = l.slice(0, idx).trim() as VisionProviderType;
      const key = l.slice(idx + 1).trim();
      return PROVIDERS[type] ? { type, key } : null;
    })
    .filter((x): x is { type: VisionProviderType; key: string } => x !== null && !!x.key);
}

// ---------------- 缓存与冷却 ----------------

type CacheShape = {
  /** 图片指纹 → 提取到的属性 JSON */
  results: Record<string, string>;
  /** provider type → 失败截止时间戳 */
  cooldown: Record<string, number>;
};

function readCache(): CacheShape {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return { results: c?.results || {}, cooldown: c?.cooldown || {} };
  } catch {
    return { results: {}, cooldown: {} };
  }
}

function writeCache(c: CacheShape): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c), 'utf8');
}

function imgFingerprint(buf: Buffer): string {
  // 采样指纹：长度 + 首中尾字节，避免整图 hash 的开销
  const n = buf.length;
  let h = n;
  for (const i of [0, 1, 2, n >> 1, (n >> 1) + 1, n - 2, n - 1]) {
    if (i >= 0 && i < n) h = ((h << 5) + h + buf[i]) | 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------- 属性提取 ----------------

const PROMPT = `You are analyzing a product photo of a football (soccer) jersey for an online store search system.
Extract searchable attributes and reply with ONLY a JSON object (no markdown, no explanation):
{"team":"club or national team name, or empty","season":"e.g. 2025-26, or empty","type":"home/away/third/gk/training/retro/kids/outerwear/shorts, or empty","colors":["main colors"],"keywords":["3-6 short search keywords, e.g. arsenal home 2025-26 red"]}
If the image is not a jersey, return {"keywords":["not-a-jersey"]}.`;

type VisionAttrs = {
  team?: string;
  season?: string;
  type?: string;
  colors?: string[];
  keywords?: string[];
};

/** 轮换调用视觉 API，返回提取到的属性；全部失败返回 null */
export async function describeImage(buf: Buffer, keysRaw: string): Promise<VisionAttrs | null> {
  const providers = parseVisionKeys(keysRaw);
  if (!providers.length) return null;

  const cache = readCache();
  const fp = imgFingerprint(buf);
  const cached = cache.results[fp];
  if (cached) {
    try {
      return JSON.parse(cached) as VisionAttrs;
    } catch { /* 缓存损坏，重新提取 */ }
  }

  const now = Date.now();
  // 轮换顺序：按配置顺序跳过冷却中的 provider
  const ordered = [...providers].sort((a, b) => (cache.cooldown[a.type] || 0) - (cache.cooldown[b.type] || 0));

  for (const p of ordered) {
    if ((cache.cooldown[p.type] || 0) > now) continue; // 冷却中
    const def = PROVIDERS[p.type];
    try {
      const b64 = buf.toString('base64');
      const res = await fetch(def.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: def.defaultModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
            ],
          }],
          temperature: 0,
          max_tokens: 300,
        }),
      });
      if (!res.ok) throw new Error(`${def.type} ${res.status}`);
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json in response');
      const attrs = JSON.parse(jsonMatch[0]) as VisionAttrs;
      cache.results[fp] = JSON.stringify(attrs);
      delete cache.cooldown[p.type];
      writeCache(cache);
      return attrs;
    } catch {
      cache.cooldown[p.type] = now + COOLDOWN_MS;
      writeCache(cache);
      // 继续下一个 provider
    }
  }
  return null;
}

/** 属性 → 检索关键词 */
export function attrsToKeywords(attrs: VisionAttrs): string[] {
  const kws: string[] = [];
  if (attrs.team) kws.push(attrs.team);
  if (attrs.season) kws.push(attrs.season);
  if (attrs.type) kws.push(attrs.type);
  for (const c of attrs.colors || []) kws.push(c);
  for (const k of attrs.keywords || []) kws.push(k);
  return kws.filter(k => k && k.length >= 2);
}

export const VISION_PROVIDER_LABELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([k, v]) => [k, v.label]),
) as Record<VisionProviderType, string>;
