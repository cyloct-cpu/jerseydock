'use client';

import { useMemo, useRef, useState } from 'react';
import { PHONE_CC, joinPhoneValue, splitPhoneValue } from '@kitvault/shared';
import { useT } from '@/lib/store';

/**
 * 电话 / WhatsApp 号码输入（区号 + 号码两段式）
 * 区号是 combobox：可直接键入（+81 / 81 / japan 均可过滤），也可下拉选择；
 * 下拉为深色自绘列表（原生 select 弹层在深色主题下看不清且无法定制）。
 * 隐藏字段提交完整存储值「+区号 号码」，号码位只允许数字 / 空格 / 连字符。
 */
export function PhoneInput({
  name,
  defaultValue = '',
  placeholder = '138 0000 0000',
  id,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const parsed = useMemo(() => splitPhoneValue(defaultValue), [defaultValue]);
  const [cc, setCc] = useState(parsed.cc);            // 已提交的区号
  const [ccText, setCcText] = useState(parsed.cc);    // 输入框显示文本
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState(parsed.num);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const full = joinPhoneValue(cc, num);

  // 过滤：+81 / 81 / JP / japan 均可命中
  const matches = useMemo(() => {
    const q = ccText.replace(/^\+/, '').trim().toLowerCase();
    if (!q) return PHONE_CC;
    return PHONE_CC.filter(
      c => c.cc.includes(q) || c.iso.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [ccText]);

  const commit = (v: string) => {
    setCc(v);
    setCcText(v);
    setOpen(false);
  };

  const commitText = () => {
    const q = ccText.replace(/^\+/, '').trim().toLowerCase();
    if (!q) { commit(cc); return; }
    const hit = PHONE_CC.find(
      c => c.cc.replace(/^\+/, '') === q || c.iso.toLowerCase() === q,
    ) || matches[0];
    // 列表无命中但本身是合法区号格式（+1~+4 位数字）→ 允许手输任意区号
    if (hit) commit(hit.cc);
    else if (/^\+\d{1,4}$/.test(ccText.trim())) commit(ccText.trim());
    else commit(cc);
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input type="hidden" name={name} value={full} />
      <div ref={rootRef} style={{ position: 'relative', flex: 'none', width: 118 }}>
        <input
          value={ccText}
          onChange={e => { setCcText(e.currentTarget.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { commitText(); setOpen(false); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitText(); (e.currentTarget as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setCcText(cc); setOpen(false); }
          }}
          aria-label={ariaLabel ? `${ariaLabel} country code` : 'Country code'}
          inputMode="tel"
          className="input"
          style={{ width: '100%', height: 38, padding: '0 8px' }}
        />
        {open && (
          <div
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 95, width: 230,
              maxHeight: 260, overflow: 'auto',
              background: 'var(--bg, #101012)', border: '1px solid var(--line-2)', borderRadius: 4,
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}
          >
            {matches.map(c => (
              <div
                key={c.cc + c.iso}
                // onMouseDown 抢在 blur 之前提交
                onMouseDown={e => { e.preventDefault(); commit(c.cc); }}
                style={{
                  display: 'flex', gap: 8, alignItems: 'baseline', padding: '7px 10px', cursor: 'pointer',
                  background: c.cc === cc ? 'var(--surface-2, rgba(255,255,255,0.05))' : 'transparent',
                }}
              >
                <span className="mono" style={{ color: 'var(--accent)', width: 44, flex: 'none' }}>{c.cc}</span>
                <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>{c.name}</span>
              </div>
            ))}
            {!matches.length && (
              <div className="dim" style={{ padding: '8px 10px', fontSize: 'var(--fs-micro)' }}>
                {t('phone.no_match')}
              </div>
            )}
          </div>
        )}
      </div>
      <input
        id={id}
        className="input"
        value={num}
        onChange={e => setNum(e.currentTarget.value.replace(/[^\d\s-]/g, '').slice(0, 18))}
        placeholder={placeholder}
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={ariaLabel}
        style={{ flex: 1 }}
      />
    </div>
  );
}
