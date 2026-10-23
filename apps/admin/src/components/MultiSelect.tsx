'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export type MsOption = { value: string; label: string; group?: string };

/**
 * 多选下拉（后台表单用）
 * - 触发区：已选项 chips（可逐个移除）+ 占位文案 + 箭头
 * - 面板：关键字过滤、分组小标题、复选框行；allowCustom 时输入框回车可把关键字加成新选项
 * - 提交：为每个已选项渲染一个同名 hidden input（formData.getAll 取值）
 */
export function MultiSelect({
  name,
  options,
  initial = [],
  placeholder = '请选择…',
  allowCustom = false,
  max = 24,
  hint,
}: {
  name: string;
  options: MsOption[];
  initial?: string[];
  placeholder?: string;
  allowCustom?: boolean;
  max?: number;
  hint?: string;
}) {
  const [selected, setSelected] = useState<string[]>(() => {
    const seen = new Set<string>();
    return initial.filter(v => v && !seen.has(v) && seen.add(v)).slice(0, max);
  });
  const [custom, setCustom] = useState<MsOption[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (open) filterRef.current?.focus();
  }, [open]);

  const allOptions = useMemo(() => {
    const map = new Map<string, MsOption>();
    options.forEach(o => map.set(o.value, o));
    custom.forEach(o => { if (!map.has(o.value)) map.set(o.value, o); });
    return [...map.values()];
  }, [options, custom]);

  const labelOf = (v: string) => allOptions.find(o => o.value === v)?.label || v;

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? allOptions.filter(o => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    : allOptions;

  // 按 group 聚合（无 group 的归入「其他」）
  const groups = useMemo(() => {
    const map = new Map<string, MsOption[]>();
    for (const o of filtered) {
      const g = o.group || '其他';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (v: string) => {
    setSelected(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v].slice(0, max));
  };

  const onFilterKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = filter.trim();
    if (!v) return;
    const exact = allOptions.find(o => o.value.toLowerCase() === v.toLowerCase() || o.label.toLowerCase() === v.toLowerCase());
    if (exact) { toggle(exact.value); setFilter(''); return; }
    if (allowCustom) {
      setCustom(prev => (prev.some(o => o.value === v || o.label === v) ? prev : [...prev, { value: v, label: v }]));
      setSelected(prev => (prev.includes(v) ? prev : [...prev, v].slice(0, max)));
      setFilter('');
    }
  };

  const canAddCustom = allowCustom && filter.trim() && !allOptions.some(o => o.value.toLowerCase() === filter.trim().toLowerCase() || o.label.toLowerCase() === filter.trim().toLowerCase());

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {/* 提交值：每个已选项一个 hidden input */}
      {selected.map(v => <input key={v} type="hidden" name={name} value={v} />)}

      {/* 触发区 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        style={{
          minHeight: 34, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5,
          background: 'var(--surface-2)', border: `1px solid ${open ? 'var(--accent)' : 'var(--line-2)'}`,
          borderRadius: 2, padding: '4px 30px 4px 8px', cursor: 'pointer', position: 'relative',
        }}
      >
        {selected.length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-small)', paddingLeft: 2 }}>{placeholder}</span>}
        {selected.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-micro)', color: 'var(--text)', background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 2, padding: '2px 4px 2px 7px', lineHeight: 1.4 }}>
            {labelOf(v)}
            <button
              type="button"
              title="移除"
              onClick={e => { e.stopPropagation(); toggle(v); }}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
        <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 9, pointerEvents: 'none' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* 下拉面板 */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 2,
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
            <input
              ref={filterRef}
              className="input"
              style={{ height: 30 }}
              value={filter}
              onChange={e => setFilter(e.currentTarget.value)}
              onKeyDown={onFilterKeyDown}
              placeholder={allowCustom ? '过滤选项，回车可添加新项…' : '过滤选项…'}
            />
          </div>
          <div style={{ maxHeight: 232, overflowY: 'auto', padding: '4px 0' }}>
            {groups.map(([g, list]) => (
              <div key={g}>
                <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '7px 12px 3px' }}>{g}</div>
                {list.map(o => {
                  const on = selected.includes(o.value);
                  return (
                    <label
                      key={o.value}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer',
                        fontSize: 'var(--fs-small)', color: on ? 'var(--accent)' : 'var(--text-2)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(o.value)}
                        style={{ accentColor: 'var(--accent)', margin: 0 }}
                      />
                      <span style={{ flex: 1 }}>{o.label}</span>
                      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{o.value}</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {canAddCustom && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => { const v = filter.trim(); setCustom(prev => (prev.some(o => o.value === v || o.label === v) ? prev : [...prev, { value: v, label: v }])); setSelected(prev => (prev.includes(v) ? prev : [...prev, v].slice(0, max))); setFilter(''); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 'var(--fs-small)', color: 'var(--accent)', borderTop: groups.length ? '1px solid var(--line)' : undefined }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ width: 13, textAlign: 'center' }}>＋</span>
                <span>添加「{filter.trim()}」</span>
              </div>
            )}
            {filtered.length === 0 && !canAddCustom && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 'var(--fs-small)', color: 'var(--text-3)' }}>没有匹配的选项</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderTop: '1px solid var(--line)', fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>
            <span>{hint || `已选 ${selected.length} 项 · 点击外部关闭`}</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => setSelected([])} style={{ border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 'var(--fs-micro)', cursor: 'pointer', padding: 0 }}>清空</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
