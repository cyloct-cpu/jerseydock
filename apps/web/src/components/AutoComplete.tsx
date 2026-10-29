'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/store';

/**
 * 自动匹配输入（单选 combobox）
 * - 输入即过滤，↑/↓ 选择，Enter 确认，Esc 关闭
 * - allowFreeText：无匹配时保留输入内容原样提交（国家「Other」、城市自由填写）
 * - display：value → 本地化显示名（如 Intl.DisplayNames 生成的各国语言国名）。
 *   下拉展示本地化名，匹配同时比对「原值 + 本地化名」（去重音归一化），
 *   提交仍是原值（value），保证订单 / 物流数据为英文规范名。
 * - 自绘下拉面板：修复原生 <select> 在深色主题下选项文字发灰看不清的问题
 */
export function AutoComplete({
  value,
  onChange,
  options,
  placeholder,
  allowFreeText = true,
  hint,
  id,
  required,
  display,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  allowFreeText?: boolean;
  hint?: string;
  id?: string;
  required?: boolean;
  display?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const t = useT();

  /** 匹配归一化：NFD 去变音符号（é→e）+ 小写；阿拉伯语 / 泰语等不合成分音符，小写比较即可 */
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const label = (o: string) => display?.[o] || o;

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter(o => {
      const keys = [o, display?.[o]].filter(Boolean) as string[];
      return keys.some(k => norm(k).includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, display]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const commit = (v: string) => {
    onChange(v);
    setQuery('');
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(i => (filtered.length ? Math.min(i + 1, filtered.length - 1) : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && filtered[active]) {
        e.preventDefault();
        commit(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        type="text"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={open ? query : label(value)}
        onFocus={() => { setOpen(true); setQuery(''); setActive(-1); }}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
          if (allowFreeText) onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        style={{ paddingRight: 30 }}
      />
      <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 9, pointerEvents: 'none' }}>{open ? '▲' : '▼'}</span>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 3,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{ maxHeight: 224, overflowY: 'auto' }}>
            {filtered.map((o, i) => (
              <div
                key={o}
                onMouseDown={e => { e.preventDefault(); commit(o); }}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--fs-small)',
                  color: i === active ? 'var(--accent)' : 'var(--text-2)',
                  background: i === active ? 'var(--surface-3)' : 'transparent',
                }}
              >
                {label(o)}
              </div>
            ))}
            {!filtered.length && (
              <div style={{ padding: '14px 12px', fontSize: 'var(--fs-small)', color: 'var(--text-3)' }}>
                {allowFreeText ? t('autocomplete.no_match_free') : t('autocomplete.no_match')}
              </div>
            )}
          </div>
          {hint && (
            <div style={{ padding: '7px 12px', borderTop: '1px solid var(--line)', fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{hint}</div>
          )}
        </div>
      )}
    </div>
  );
}
