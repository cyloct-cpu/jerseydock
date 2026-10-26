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

export type VisionKeyConfig = {
  /** 类型名：内置三家之一，或自定义聚合站的任意名字 */
  type: string;
  key: string;
  /** 模型名（覆盖内置默认；自定义聚合站必填） */
  model?: string;
  /** OpenAI 兼容接口地址（内置三家可省略，自定义必填） */
  endpoint?: string;
};

/**
 * 解析设置里的 key 列表，每行一个，支持 2~4 段（冒号分隔）：
 *   类型:密钥                       —— 内置三家，用默认模型
 *   类型:密钥:模型                  —— 内置三家换模型（如 openrouter 换其它免费模型）
 *   类型:密钥:模型:接口地址         —— 任意 OpenAI 兼容聚合站（硅基流动 / DeepSeek / 自建网关…）
 * 未知类型且没给齐「模型+接口地址」的行无法调用，直接忽略。
 */
export function parseVisionKeys(raw: string): VisionKeyConfig[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map((line): VisionKeyConfig | null => {
      const i1 = line.indexOf(':');
      if (i1 <= 0) return null;
      const type = line.slice(0, i1).trim();
      const rest = line.slice(i1 + 1).trim();
      const i2 = rest.indexOf(':');
      const key = (i2 === -1 ? rest : rest.slice(0, i2)).trim();
      if (!type || !key) return null;
      // tail 是「模型[:接口地址]」：模型名可含冒号（如 openrouter 的 :free 后缀），
      // 所以接口地址只能认「:http(s)://」边界，不能按冒号盲切
      const tail = i2 === -1 ? '' : rest.slice(i2 + 1).trim();
      let model = tail;
      let endpoint: string | undefined;
      if (tail) {
        const m = tail.match(/:(https?:\/\/\S+)$/);
        if (m) { endpoint = m[1]; model = tail.slice(0, m.index).trim(); }
      }
      if (type in PROVIDERS) {
        const def = PROVIDERS[type as VisionProviderType];
        return { type, key, model: model || def.defaultModel, endpoint: endpoint || def.endpoint };
      }
      // 自定义聚合站：模型 + 接口地址缺一不可；地址没写到 /chat/completions 就按 OpenAI 惯例补全
      if (!model || !endpoint) return null;
      const base = endpoint.replace(/\/+$/, '');
      return { type, key, model, endpoint: /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions` };
    })
    .filter((x): x is VisionKeyConfig => x !== null);
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
  const ckOf = (p: VisionKeyConfig) => `${p.type}:${p.model || ''}`;
  // 轮换顺序：最久没失败的优先，冷却中的跳过
  const ordered = [...providers].sort((a, b) => (cache.cooldown[ckOf(a)] || 0) - (cache.cooldown[ckOf(b)] || 0));

  for (const p of ordered) {
    // 冷却键带模型名：同一个站换模型不影响冷却状态
    const ckKey = `${p.type}:${p.model || ''}`;
    if ((cache.cooldown[ckKey] || 0) > now) continue; // 冷却中
    try {
      const b64 = buf.toString('base64');
      const res = await fetch(p.endpoint!, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: p.model!,
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
      if (!res.ok) throw new Error(`${p.type} ${res.status}`);
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no json in response');
      const attrs = JSON.parse(jsonMatch[0]) as VisionAttrs;
      cache.results[fp] = JSON.stringify(attrs);
      delete cache.cooldown[ckKey];
      writeCache(cache);
      return attrs;
    } catch {
      cache.cooldown[ckKey] = now + COOLDOWN_MS;
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
