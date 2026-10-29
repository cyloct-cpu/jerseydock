'use client';

import { useMemo, useState } from 'react';
import { COUNTRIES, COUNTRY_CITIES, COUNTRY_CODES } from '@kitvault/shared';
import { useCityDisplay } from '@/lib/use-city-display';
import { saveAddressAction } from '@/lib/auth-actions';
import { AutoComplete } from '@/components/AutoComplete';
import { T } from '@/components/ContentT9n';
import { useStore, useT } from '@/lib/store';

/**
 * 收货地址表单（客户端组件）
 * 国家 / 城市用 AutoComplete（输入即匹配，自由文本兜底）；
 * 受控值同时以隐藏字段提交给 Server Action。
 */
export function AddressForm({
  entryId,
  initialAddress,
  initialCity,
  initialCountry,
  initialZip,
}: {
  entryId?: string;
  initialAddress: string;
  initialCity: string;
  initialCountry: string;
  initialZip: string;
}) {
  const t = useT();
  const { locale } = useStore();
  const [address, setAddress] = useState(initialAddress);
  const [city, setCity] = useState(initialCity);
  const [country, setCountry] = useState(initialCountry);
  const [zip, setZip] = useState(initialZip);

  const cityOptions = COUNTRY_CITIES[country] || [];

  // 国家本地化（Intl.DisplayNames，29 语言）+ 城市建议名机翻；提交仍是英文规范名
  const countryDisplay = useMemo(() => {
    if (locale === 'en' || typeof Intl === 'undefined' || typeof (Intl as { DisplayNames?: unknown }).DisplayNames !== 'function') return {};
    const m: Record<string, string> = {};
    try {
      const dn = new Intl.DisplayNames(locale, { type: 'region' });
      for (const c of COUNTRIES) {
        const code = COUNTRY_CODES[c];
        if (!code) continue;
        const n = dn.of(code);
        if (n && n !== c) m[c] = n;
      }
    } catch { /* DisplayNames 不可用 → 英文 */ }
    return m;
  }, [locale]);
  const cityDisplay = useCityDisplay(cityOptions);

  return (
    <form action={saveAddressAction} style={{ marginTop: 16, display: 'grid', gap: 14, maxWidth: 560 }}>
      {entryId && <input type="hidden" name="entryId" value={entryId} />}
      <input type="hidden" name="address" value={address} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="zip" value={zip} />

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="addr-line"><T k="addr.street" /></label>
        <input id="addr-line" className="input" value={address} onChange={e => setAddress(e.target.value)} maxLength={200} placeholder={t('addr.street_ph')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="addr-city"><T k="addr.city" /></label>
          <AutoComplete
            id="addr-city"
            value={city}
            onChange={setCity}
            options={cityOptions}
            display={cityDisplay}
            placeholder={t('addr.city_ph')}
            hint={cityOptions.length ? t('checkout.city_suggest').replace('{n}', String(cityOptions.length)) : t('checkout.city_suggest_none')}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="addr-zip"><T k="addr.zip" /></label>
          <input id="addr-zip" className="input" value={zip} onChange={e => setZip(e.target.value)} maxLength={20} placeholder={t('addr.zip_ph')} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="addr-country"><T k="addr.country" /></label>
        <AutoComplete
          id="addr-country"
          value={country}
          onChange={setCountry}
          options={COUNTRIES}
          display={countryDisplay}
          placeholder={t('addr.country_ph')}
          hint={t('checkout.country_hint')}
        />
      </div>
      <div>
        <button className="btn" type="submit"><T k={entryId ? 'addr.update' : 'addr.save'} /></button>
      </div>
    </form>
  );
}
