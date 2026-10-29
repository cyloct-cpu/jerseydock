import { cookies } from 'next/headers';
import { ensureServerDicts } from '@/lib/server-dict';
export type Locale = 'en' | 'zh' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'ko' | 'ru' | 'ar' | 'it' | 'nl' | 'tr' | 'pl' | 'sv' | 'da' | 'fi' | 'no' | 'el' | 'cs' | 'hu' | 'ro' | 'uk' | 'th' | 'vi' | 'id' | 'ms' | 'hi' | 'he';

/**
 * 服务端读取前台语言：客户端切换语言时同步写 cookie（Controls.tsx）。
 * 无 cookie（首次访问）默认英文——前台客户端组件会在水合后按 localStorage 的语言二次渲染。
 */
const LOCALES = new Set([
  'en', 'zh', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'ru', 'ar',
  'it', 'nl', 'tr', 'pl', 'sv', 'da', 'fi', 'no', 'el', 'cs',
  'hu', 'ro', 'uk', 'th', 'vi', 'id', 'ms', 'hi', 'he',
]);

export async function getLocaleFromCookies(): Promise<Locale> {
  ensureServerDicts(); // 服务端 translate 需要 MT 补全（磁盘缓存 → runtimeDict）
  try {
    const store = await cookies();
    const v = store.get('kv_locale')?.value || '';
    return (LOCALES.has(v) ? v : 'en') as Locale;
  } catch {
    return 'en';
  }
}
