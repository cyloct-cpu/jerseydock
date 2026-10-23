'use client';

import { useState } from 'react';

/** 设置页：向 OMS 拉取最新渠道 / 仓库列表并刷新缓存 */
export function OmsRefreshButton() {
  const [phase, setPhase] = useState<'idle' | 'busy'>('idle');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const refresh = async () => {
    setPhase('busy'); setMsg('');
    try {
      const res = await fetch('/api/oms/reference', { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.ok) {
        setOk(true);
        setMsg(`已更新：渠道 ${j.channels} 个 · 仓库 ${j.warehouses} 个`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setOk(false);
        setMsg(j.error || '拉取失败');
      }
    } catch {
      setOk(false);
      setMsg('请求失败，请重试');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-ghost btn-sm" type="button" disabled={phase === 'busy'} onClick={refresh}>
        {phase === 'busy' ? '拉取中…' : '从服务商拉取渠道 / 仓库'}
      </button>
      {msg && <span className="dim" style={{ fontSize: 'var(--fs-micro)', color: ok ? 'var(--ok, #46A758)' : '#E5484D' }}>{msg}</span>}
    </div>
  );
}
