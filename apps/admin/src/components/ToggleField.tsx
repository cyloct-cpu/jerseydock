'use client';

import { useState } from 'react';

/** 开关式布尔字段（替代裸 checkbox）：隐藏字段提交 on/off，与服务端 === 'on' 的解析兼容 */
export function ToggleField({
  name,
  defaultOn,
  label,
  hint,
}: {
  name: string;
  defaultOn: boolean;
  label: string;
  hint?: string;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name={name} value={on ? 'on' : 'off'} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(v => !v)}
        style={{
          width: 42, height: 23, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
          background: on ? 'var(--accent)' : 'var(--line-2)', transition: 'background .15s', flex: 'none', padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: on ? 21 : 2, width: 19, height: 19, borderRadius: '50%',
            background: '#0A0A0B', transition: 'left .15s',
          }}
        />
      </button>
      <span style={{ fontSize: 'var(--fs-small)', color: on ? 'var(--accent)' : 'var(--text-2)' }}>
        {on ? '已开启' : '已关闭'}
      </span>
      {hint && <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{hint}</span>}
    </div>
  );
}
