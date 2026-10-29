import fs from 'fs';
import path from 'path';
import { LOCALES, setRuntimeDict, type Locale } from '@/lib/i18n';

/**
 * 服务端渲染的 MT 补全装载
 * 客户端词典由 store.tsx 拉 /api/i18n 注入；服务端 translate() 原本读不到
 * 机器翻译补全（22 种非内置语言 SSR 回落英文）。这里在服务端把
 * data/mt-cache/{locale}.json（/api/i18n 的磁盘缓存）灌进 runtimeDict，
 * 让服务端组件（订单详情 / 账户页等）的 SSR 文本与其他语言一致。
 * 进程内缓存 5 分钟，跟随磁盘缓存的更新。
 */
const TTL_MS = 5 * 60 * 1000;
let loadedAt = 0;

export function ensureServerDicts(): void {
  if (Date.now() - loadedAt < TTL_MS) return;
  loadedAt = Date.now();

  const candidates = [
    path.resolve(process.cwd(), '..', '..', 'data', 'mt-cache'), // apps/web 运行
    path.resolve(process.cwd(), 'data', 'mt-cache'), // 根目录运行兜底
  ];
  const dir = candidates.find(d => fs.existsSync(path.dirname(d)));
  if (!dir) return;

  for (const loc of LOCALES) {
    if (loc === 'en') continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, `${loc}.json`), 'utf8')) as Record<string, { src?: string; out?: string }>;
      const dict: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v?.out && v.out !== v.src) dict[k] = v.out; // 过滤被污染的「原文=译文」条目
      }
      if (Object.keys(dict).length) setRuntimeDict(loc as Locale, dict);
    } catch { /* 无缓存文件 → 该语言回落内置/英文 */ }
  }
}
