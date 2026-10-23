'use client';

import { useState } from 'react';

/**
 * 密码输入框（带显示/隐藏切换 + 强度提示）
 * 用于「新建账号」「重置密码」等需要生成强密码的场景——
 * 密码是临时生成的，需要能看清并复制给本人。
 */
export function PasswordInput({
  name,
  label,
  placeholder,
  required = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState('');

  // 强度：长度 + 字符种类
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(value)).length;
  const strong = value.length >= 12 && kinds >= 3;
  const ok = value.length >= 8;
  const level = !value ? '' : !ok ? 'bad' : strong ? 'ok' : 'warn';
  const hint = !value ? '' : !ok ? `仅 ${value.length} 位，至少需要 8 位` : strong ? '强度良好' : '可用，建议加长并混合大小写、数字、符号';

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.currentTarget.value)}
          placeholder={placeholder}
          required={required}
          minLength={8}
          autoComplete="new-password"
          style={{ fontFamily: show ? 'var(--font-mono)' : undefined }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShow(s => !s)}
          aria-label={show ? '隐藏密码' : '显示密码'}
          title={show ? '隐藏' : '显示'}
          style={{ flex: '0 0 auto', minWidth: 52 }}
        >
          {show ? '隐藏' : '显示'}
        </button>
        {show && value && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigator.clipboard?.writeText(value)}
            title="复制密码"
            style={{ flex: '0 0 auto', minWidth: 52 }}
          >
            复制
          </button>
        )}
      </div>
      {hint && (
        <span
          style={{
            fontSize: 'var(--fs-micro)',
            color: level === 'ok' ? 'var(--ok)' : level === 'warn' ? 'var(--warn)' : 'var(--bad)',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
