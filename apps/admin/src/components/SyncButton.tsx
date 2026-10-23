'use client';

import { useState } from 'react';

/** 物流管理：从 17TRACK API 批量同步轨迹按钮 */
export function SyncButton({ disabled }: { disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'syncing'>('idle');
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);

  const sync = async () => {
    setPhase('syncing'); setMsg('');
    try {
      const res = await fetch('/api/tracking17/sync', { method: 'POST' });
      const j = await res.json();
      if (res.ok && j.ok) {
        setMsgOk(true);
        setMsg(`同步完成：${j.synced} 个包裹已更新 · 跳过 ${j.skipped} · 失败 ${j.failed}`);
        setTimeout(() => setMsg(''), 5000);
        // 刷新页面显示最新数据
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMsgOk(false);
        setMsg(j.error || '同步失败');
      }
    } catch {
      setMsgOk(false); setMsg('同步请求失败，请重试');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn" type="button" disabled={disabled || phase === 'syncing'} onClick={sync}
        style={msgOk ? { borderColor: 'var(--ok)', color: 'var(--ok)' } : undefined}>
        {phase === 'syncing' ? '同步中…' : '从 17TRACK 同步轨迹'}
      </button>
      {msg && <span className="dim" style={{ fontSize: 'var(--fs-micro)', color: msgOk ? 'var(--ok)' : '#E5484D' }}>{msg}</span>}
    </div>
  );
}
