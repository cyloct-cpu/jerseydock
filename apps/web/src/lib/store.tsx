'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CurrencyCode } from '@kitvault/shared';
import { FALLBACK_RATES, currencyForCountry, type RatesResult } from '@kitvault/shared';
import { type Locale, setRuntimeDict, RTL_LOCALES } from './i18n';

export type CartItem = {
  handle: string;
  title: string;
  price: number;
  size: string;
  image: string;
  qty: number;
  /** 定制项：姓名号码烫印（已含加价） */
  customText?: string;
  /** 定制项：袖章（已含加价） */
  armband?: string;
};

type StoreState = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (handle: string, size: string, qty: number, custom?: Pick<CartItem, 'customText' | 'armband'>) => void;
  removeFromCart: (handle: string, size: string, custom?: Pick<CartItem, 'customText' | 'armband'>) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotalUsd: number;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  rates: Record<CurrencyCode, number>;
  locale: Locale;
  setLocale: (l: Locale) => void;
};

/** 行项目身份：同款 + 同尺码 + 同定制才算同一行（不同烫印/补丁各占一行） */
export function cartItemKey(
  handle: string,
  size: string,
  custom?: Pick<CartItem, 'customText' | 'armband'>,
): string {
  return `${handle}::${size}::${custom?.customText ?? ''}::${custom?.armband ?? ''}`;
}

const StoreContext = createContext<StoreState | null>(null);

const LS = { cart: 'kv_cart', currency: 'kv_currency', locale: 'kv_locale', rates: 'kv_rates' };

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(() => readLS<CartItem[]>(LS.cart, []));
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => readLS<CurrencyCode>(LS.currency, 'USD'));
  const [locale, setLocaleState] = useState<Locale>(() => readLS<Locale>(LS.locale, 'en'));
  // 机翻词典注入版本号：注入后全站文本重新渲染
  const [dictVersion, setDictVersion] = useState(0);
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(
    () => readLS<Record<CurrencyCode, number>>(LS.rates, FALLBACK_RATES)
  );

  // 汇率：服务端 /api/fx（免费源轮换 + 1h 缓存），失败用内置回退
  useEffect(() => {
    let alive = true;
    fetch('/api/fx')
      .then(r => (r.ok ? r.json() : null))
      .then((j: (RatesResult & { cached?: boolean }) | null) => {
        if (!alive || !j?.rates) return;
        setRates(j.rates);
        try { window.localStorage.setItem(LS.rates, JSON.stringify(j.rates)); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 机器翻译词典：切换到机翻语言时拉取一次，注入运行时（磁盘缓存在服务端，二次切换瞬时返回）
  useEffect(() => {
    let alive = true;
    if (locale === 'en') { setDictVersion(v => v + 1); return; }
    fetch(`/api/i18n?locale=${locale}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { dict?: Record<string, string> } | null) => {
        if (!alive || !j?.dict) return;
        setRuntimeDict(locale, j.dict);
        setDictVersion(v => v + 1); // 触发全站重新翻译渲染
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [locale]);

  // html lang / dir（阿拉伯语、希伯来语等 RTL 语言）
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  // 首次访问按国家推荐货币（不覆盖用户手动选择）
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LS.currency)) return;
      fetch('https://ipapi.co/json/')
        .then(r => (r.ok ? r.json() : null))
        .then(j => {
          const c = currencyForCountry(j?.country_code);
          if (c) setCurrencyState(c);
        })
        .catch(() => {});
    } catch {}
  }, []);

  useEffect(() => { try { window.localStorage.setItem(LS.cart, JSON.stringify(cart)); } catch {} }, [cart]);
  useEffect(() => { try { window.localStorage.setItem(LS.currency, JSON.stringify(currency)); } catch {} }, [currency]);
  useEffect(() => { try { window.localStorage.setItem(LS.locale, JSON.stringify(locale)); } catch {} }, [locale]);

  const addToCart = useCallback((item: Omit<CartItem, 'qty'>, qty = 1) => {
    setCart(prev => {
      const key = cartItemKey(item.handle, item.size, item);
      const i = prev.findIndex(x => cartItemKey(x.handle, x.size, x) === key);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + qty, 99) };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const setQty = useCallback((handle: string, size: string, qty: number, custom?: Pick<CartItem, 'customText' | 'armband'>) => {
    const key = cartItemKey(handle, size, custom);
    setCart(prev => prev.map(x => (cartItemKey(x.handle, x.size, x) === key ? { ...x, qty: Math.max(0, Math.min(qty, 99)) } : x)).filter(x => x.qty > 0));
  }, []);

  const removeFromCart = useCallback((handle: string, size: string, custom?: Pick<CartItem, 'customText' | 'armband'>) => {
    const key = cartItemKey(handle, size, custom);
    setCart(prev => prev.filter(x => cartItemKey(x.handle, x.size, x) !== key));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo<StoreState>(() => ({
    cart,
    addToCart,
    setQty,
    removeFromCart,
    clearCart,
    cartCount: cart.reduce((s, x) => s + x.qty, 0),
    cartTotalUsd: cart.reduce((s, x) => s + x.price * x.qty, 0),
    currency,
    setCurrency: setCurrencyState,
    rates,
    locale,
    setLocale: setLocaleState,
    // dictVersion 变化时强制重新渲染（机翻词典已注入）
  }), [cart, addToCart, setQty, removeFromCart, clearCart, currency, rates, locale, dictVersion]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function useT() {
  // 词典版本参与订阅：机翻注入后 dictVersion 变化 → 消费组件重渲染 → t() 重新执行
  useStore();
  const { locale } = useStore();
  return useCallback((key: string) => {
    // translate 为运行时查模块级词典（含机翻注入），无闭包过期问题
    return translateKey(locale, key);
  }, [locale]);
}

import { translate as translateKey } from './i18n';
