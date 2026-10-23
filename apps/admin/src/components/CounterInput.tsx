'use client';

import { useState } from 'react';

/** 带字数统计的文本输入（参考主流电商后台 n/128 形态） */
export function CounterInput({
  name,
  defaultValue = '',
  maxLength = 128,
  required = false,
  placeholder = '',
  id,
}: {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [len, setLen] = useState(defaultValue.length);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        style={{ paddingRight: 64 }}
        onChange={e => setLen(e.currentTarget.value.length)}
      />
      <span
        className="dim"
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--fs-micro)', pointerEvents: 'none' }}
      >
        {len}/{maxLength}
      </span>
    </div>
  );
}
