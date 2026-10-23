'use client';

import { useState } from 'react';

/** 密码输入框：右侧「显示 / 隐藏」切换（与后台一致的交互） */
export function PasswordInput({
  name,
  label,
  placeholder,
  required,
  autoComplete = 'new-password',
  minLength,
}: {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  const id = `pw_${name}`;
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      {label && <label htmlFor={id}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="input"
          name={name}
          type={show ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          placeholder={placeholder}
          style={{ paddingRight: 56 }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', color: 'var(--text-3)',
            fontSize: 'var(--fs-micro)', cursor: 'pointer', padding: '4px 6px',
          }}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
