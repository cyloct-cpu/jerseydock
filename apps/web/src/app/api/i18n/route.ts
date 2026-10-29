/**
 * GET /api/i18n?locale=xx
 * 返回该语言的完整 UI 词典：内置翻译 + 机器翻译补全（免费 API 轮换，磁盘缓存）。
 * 客户端切换语言时调用一次，注入运行时词典。
 */
import { NextResponse } from 'next/server';

// 词典更新（内置补全 / MT 预热）后客户端必须立刻拿到新版本
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } } as const;
import { DICTS, LOCALES, type Locale } from '@/lib/i18n';
import { fillDictionary } from '@/lib/mt';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locale = url.searchParams.get('locale') ?? '';
  if (!(LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'unsupported locale' }, { status: 400, ...NO_STORE });
  }
  const loc = locale as Locale;
  const en = DICTS.en;
  const builtin = DICTS[loc];

  if (loc === 'en') {
    return NextResponse.json({ locale, dict: en, machineTranslated: 0, source: 'builtin' }, NO_STORE);
  }

  // 该语言内置词典完整（覆盖全部 en key）则直接返回，不打翻译 API
  const missing = Object.keys(en).filter(k => builtin[k] == null);
  if (missing.length === 0) {
    return NextResponse.json({ locale, dict: builtin, machineTranslated: 0, source: 'builtin' }, NO_STORE);
  }

  try {
    const { dict, translated, source } = await fillDictionary(loc, en, builtin);
    return NextResponse.json({
      locale,
      dict: { ...dict, ...builtin }, // 内置翻译优先
      machineTranslated: translated,
      source: source ?? 'cache',
    }, NO_STORE);
  } catch {
    return NextResponse.json({ locale, dict: builtin, machineTranslated: 0, source: 'builtin' }, NO_STORE);
  }
}
