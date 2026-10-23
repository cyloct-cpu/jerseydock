'use client';

import { useState, type CSSProperties } from 'react';

/**
 * 颜色选择器 + 文本框联动（settings 页顶部公告条用）
 * 取色块只负责「点选填色」，真正提交的是同名的文本输入框（允许留空表示用主题默认值）。
 */
export function ColorField({
  name,
  label,
  value,
  fallback,
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  fallback: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);

  const swatch: CSSProperties = {
    width: 44,
    height: 34,
    padding: 2,
    background: 'var(--surface-2)',
    border: '1px solid var(--line-2)',
    borderRadius: 2,
    cursor: 'pointer',
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="color"
          value={text || fallback}
          style={swatch}
          aria-label={`${label} 取色器`}
          onChange={e => setText(e.currentTarget.value)}
        />
        <input
          className="input"
          name={name}
          value={text}
          placeholder={placeholder}
          onChange={e => setText(e.currentTarget.value)}
        />
      </div>
    </div>
  );
}
