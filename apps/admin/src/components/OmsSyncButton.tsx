'use client';

import { useState } from 'react';

/** 物流 / 订单页：立即触发一次 OMS 轨迹同步（后台 worker 每 30 分钟自动跑，此为急查入口） */
export function OmsSyncButton() {
  const [phase, setPhase] = useState<'idle' | 'syncing'>('idle');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const sync = async () => {
    setPhase('syncing'); setMsg('');
    try {
      const res = await fetch('/api/oms/track-sync', { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.ok) {
        setOk(true);
        setMsg(`已同步 ${j.synced} 单` + (j.changed ? `，${j.changed} 单状态更新` : '，无状态变化'));
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setOk(false);
        setMsg(j.error || '同步失败');
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
      <button className="btn" type="button" disabled={phase === 'syncing'} onClick={sync}
        style={ok ? { borderColor: 'var(--ok, #46A758)', color: 'var(--ok, #46A758)' } : undefined}>
        {phase === 'syncing' ? '同步中…' : '同步服务商轨迹'}
      </button>
      {msg && <span className="dim" style={{ fontSize: 'var(--fs-micro)', color: ok ? 'var(--ok, #46A758)' : '#E5484D' }}>{msg}</span>}
    </div>
  );
}
