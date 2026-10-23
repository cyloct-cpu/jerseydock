'use client';

import { useStore } from '@/lib/store';
import { CURRENCIES, type CurrencyCode } from '@kitvault/shared';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';

/** 货币切换（N1）：按国家推荐 + 手动切换 */
export function CurrencySelect() {
  const { currency, setCurrency, rates } = useStore();
  return (
    <select
      className="select"
      aria-label="Currency"
      value={currency}
      onChange={e => setCurrency(e.target.value as CurrencyCode)}
      title={rates[currency] ? 'Rate: live' : 'Rate: fallback'}
    >
      {CURRENCIES.map(c => (
        <option key={c.code} value={c.code}>
          {c.code} {c.symbol}
        </option>
      ))}
    </select>
  );
}

/** 语言切换（N1 / N4）：设计基准为英文，其余为翻译填充 */
export function LocaleSelect() {
  const { locale, setLocale } = useStore();
  // 同步写 cookie：服务端渲染的页面（账户中心等）也能拿到当前语言
  const changeLocale = (l: Locale) => {
    setLocale(l);
    document.cookie = `kv_locale=${l}; max-age=31536000; path=/`;
  };
  return (
    <select className="select" aria-label="Language" value={locale} onChange={e => changeLocale(e.target.value as Locale)}>
      {LOCALES.map(l => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
