/**
 * 多货币系统（全球版）
 * 价格一律以 USD 基准存储，展示层按汇率换算。
 * 汇率来源（免费、无需 key，按顺序轮换，前一个失败自动切下一个）：
 *   1. open.er-api.com           — 161 种货币，日更
 *   2. api.exchangerate-api.com  — 160+ 种货币，日更
 *   3. api.frankfurter.app       — 欧央行参考汇率（覆盖较窄，作补充）
 *   4. jsdelivr @fawazahmed0/currency-api — 全量货币，日更（CDN）
 * 全部失败时使用内置回退汇率。
 */

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'KRW' | 'INR' | 'RUB' | 'BRL' | 'MXN'
  | 'CAD' | 'AUD' | 'NZD' | 'SGD' | 'HKD' | 'TWD' | 'CHF' | 'SEK' | 'NOK' | 'DKK'
  | 'PLN' | 'CZK' | 'HUF' | 'RON' | 'TRY' | 'AED' | 'SAR' | 'ILS' | 'ZAR' | 'THB'
  | 'VND' | 'IDR' | 'MYR' | 'PHP' | 'UAH' | 'EGP' | 'NGN' | 'ARS' | 'CLP' | 'COP';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string; countries: string[]; zero: boolean }[] = [
  { code: 'USD', symbol: '$', label: 'US Dollar', countries: ['US', 'EC'], zero: false },
  { code: 'EUR', symbol: '€', label: 'Euro', countries: ['DE', 'FR', 'ES', 'IT', 'NL', 'PT', 'IE', 'BE', 'AT', 'FI', 'GR', 'LU', 'SK', 'SI', 'HR', 'EE', 'LV', 'LT', 'CY', 'MT'], zero: false },
  { code: 'GBP', symbol: '£', label: 'British Pound', countries: ['GB'], zero: false },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', countries: ['JP'], zero: true },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan', countries: ['CN'], zero: false },
  { code: 'KRW', symbol: '₩', label: 'Korean Won', countries: ['KR'], zero: true },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee', countries: ['IN'], zero: false },
  { code: 'RUB', symbol: '₽', label: 'Russian Ruble', countries: ['RU'], zero: false },
  { code: 'BRL', symbol: 'R$', label: 'Brazilian Real', countries: ['BR'], zero: false },
  { code: 'MXN', symbol: 'Mex$', label: 'Mexican Peso', countries: ['MX'], zero: false },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar', countries: ['CA'], zero: false },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar', countries: ['AU'], zero: false },
  { code: 'NZD', symbol: 'NZ$', label: 'New Zealand Dollar', countries: ['NZ'], zero: false },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', countries: ['SG'], zero: false },
  { code: 'HKD', symbol: 'HK$', label: 'Hong Kong Dollar', countries: ['HK'], zero: false },
  { code: 'TWD', symbol: 'NT$', label: 'New Taiwan Dollar', countries: ['TW'], zero: true },
  { code: 'CHF', symbol: 'Fr', label: 'Swiss Franc', countries: ['CH', 'LI'], zero: false },
  { code: 'SEK', symbol: 'kr', label: 'Swedish Krona', countries: ['SE'], zero: false },
  { code: 'NOK', symbol: 'kr', label: 'Norwegian Krone', countries: ['NO'], zero: false },
  { code: 'DKK', symbol: 'kr', label: 'Danish Krone', countries: ['DK'], zero: false },
  { code: 'PLN', symbol: 'zł', label: 'Polish Zloty', countries: ['PL'], zero: false },
  { code: 'CZK', symbol: 'Kč', label: 'Czech Koruna', countries: ['CZ'], zero: false },
  { code: 'HUF', symbol: 'Ft', label: 'Hungarian Forint', countries: ['HU'], zero: false },
  { code: 'RON', symbol: 'lei', label: 'Romanian Leu', countries: ['RO'], zero: false },
  { code: 'TRY', symbol: '₺', label: 'Turkish Lira', countries: ['TR'], zero: false },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham', countries: ['AE'], zero: false },
  { code: 'SAR', symbol: '﷼', label: 'Saudi Riyal', countries: ['SA'], zero: false },
  { code: 'ILS', symbol: '₪', label: 'Israeli Shekel', countries: ['IL'], zero: false },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand', countries: ['ZA'], zero: false },
  { code: 'THB', symbol: '฿', label: 'Thai Baht', countries: ['TH'], zero: false },
  { code: 'VND', symbol: '₫', label: 'Vietnamese Dong', countries: ['VN'], zero: true },
  { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah', countries: ['ID'], zero: true },
  { code: 'MYR', symbol: 'RM', label: 'Malaysian Ringgit', countries: ['MY'], zero: false },
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso', countries: ['PH'], zero: false },
  { code: 'UAH', symbol: '₴', label: 'Ukrainian Hryvnia', countries: ['UA'], zero: false },
  { code: 'EGP', symbol: 'E£', label: 'Egyptian Pound', countries: ['EG'], zero: false },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira', countries: ['NG'], zero: false },
  { code: 'ARS', symbol: '$', label: 'Argentine Peso', countries: ['AR'], zero: true },
  { code: 'CLP', symbol: '$', label: 'Chilean Peso', countries: ['CL'], zero: true },
  { code: 'COP', symbol: '$', label: 'Colombian Peso', countries: ['CO'], zero: true },
];

// 回退汇率（USD 基准，近似值），所有免费源均不可用时使用
export const FALLBACK_RATES: Record<CurrencyCode, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 152, CNY: 7.12, KRW: 1350, INR: 84, RUB: 92,
  BRL: 5.45, MXN: 17.1, CAD: 1.36, AUD: 1.52, NZD: 1.64, SGD: 1.33, HKD: 7.8,
  TWD: 31.5, CHF: 0.86, SEK: 10.4, NOK: 10.6, DKK: 6.87, PLN: 3.95, CZK: 22.9,
  HUF: 355, RON: 4.58, TRY: 34.2, AED: 3.67, SAR: 3.75, ILS: 3.7, ZAR: 17.8,
  THB: 34.5, VND: 25400, IDR: 15800, MYR: 4.42, PHP: 57.8, UAH: 41.2,
  EGP: 48.5, NGN: 1650, ARS: 1000, CLP: 940, COP: 4250,
};

const ZERO_DECIMAL = new Set(CURRENCIES.filter(c => c.zero).map(c => c.code));

/** 从 ISO 国家码推断默认货币 */
export function currencyForCountry(country?: string | null): CurrencyCode {
  if (!country) return 'USD';
  const c = country.toUpperCase();
  const found = CURRENCIES.find(x => x.countries.includes(c));
  return found ? found.code : 'USD';
}

/** USD → 目标币种换算（精确值；零小数币种取整）。
 *  注意：这里绝不做 .90/.00 心理价位取整 —— convert 同时用于订单小计/折扣/总额等
 *  精确金额展示，取整曾把 $5 显示成 $0.00、$55 显示成 $50.00（前台与后台实收差 $5 资损）。
 *  营销价的 .90/.00 视觉应在定价环节处理，展示层一律精确。 */
export function convert(usd: number, rate: number, code: CurrencyCode): number {
  const v = usd * rate;
  return ZERO_DECIMAL.has(code) ? Math.round(v) : Math.round(v * 100) / 100;
}

export function format(usd: number, code: CurrencyCode, rate: number): string {
  const v = convert(usd, rate, code);
  const meta = CURRENCIES.find(c => c.code === code)!;
  const num = meta.zero ? v.toLocaleString('en-US') : v.toFixed(2);
  return `${meta.symbol}${num}`;
}

/* ------------------------------------------------------------------ */
/* 汇率源轮换                                                          */
/* ------------------------------------------------------------------ */

type Provider = {
  name: string;
  url: string;
  /** 从响应 JSON 中提取 { CODE: rate }（USD 基准） */
  pick: (json: unknown) => Record<string, number>;
};

const upperRates = (obj: Record<string, unknown> | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
  }
  return out;
};

const FX_PROVIDERS: Provider[] = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick: j => upperRates((j as { rates?: Record<string, unknown> }).rates),
  },
  {
    name: 'api.exchangerate-api.com',
    url: 'https://api.exchangerate-api.com/v4/latest/USD',
    pick: j => upperRates((j as { rates?: Record<string, unknown> }).rates),
  },
  {
    name: 'api.frankfurter.dev',
    url: 'https://api.frankfurter.dev/v1/latest?base=USD',
    pick: j => upperRates((j as { rates?: Record<string, unknown> }).rates),
  },
  {
    name: 'jsdelivr currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    pick: j => upperRates((j as { usd?: Record<string, unknown> }).usd),
  },
];

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

/** 校验：所需币种是否齐全 */
function complete(rates: Record<string, number>): boolean {
  return CURRENCIES.every(c => Number.isFinite(rates[c.code]) && rates[c.code] > 0);
}

export type RatesResult = { rates: Record<CurrencyCode, number>; source: string };

/**
 * 拉取汇率：按 FX_PROVIDERS 顺序轮换，任一源覆盖全部所需币种即返回；
 * 全部失败回退内置汇率。
 */
export async function fetchRates(): Promise<RatesResult> {
  for (const p of FX_PROVIDERS) {
    try {
      const json = await fetchJson(p.url);
      const flat = p.pick(json);
      if (!complete(flat)) continue; // 覆盖不全 → 换下一个源
      const rates = {} as Record<CurrencyCode, number>;
      for (const c of CURRENCIES) rates[c.code] = flat[c.code];
      return { rates, source: p.name };
    } catch {
      // 该源失败 → 轮换到下一个
    }
  }
  return { rates: FALLBACK_RATES, source: 'fallback' };
}
