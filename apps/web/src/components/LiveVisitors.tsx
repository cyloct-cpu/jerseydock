'use client';

import { useEffect, useRef, useState } from 'react';
import type { VisitorsConfig } from '@/lib/brand';

/**
 * 实时访客数
 *
 * 数据来源：真实活跃去重人数（windowMinutes 分钟内有活动的访客）。
 * 当真实数不足 baseCount 且 padToBase 开启时，用基准值补足并显示为 `基准值+`。
 *
 * 前台只呈现数字，不显示任何「补足 / 演示 / 模拟」字样——这类标注属于
 * 内部运营信息，暴露给访客反而会损害信任。补足规则与真实值的差异仅在
 * 后台「商店设置 · 实时访客数」中向管理员说明。
 */
export function LiveVisitors({
  handle,
  real,
  config,
  compact = false,
}: {
  /** 商品 handle；留空表示全站 */
  handle?: string;
  /** 服务端算出的真实活跃数 */
  real: number;
  config: VisitorsConfig;
  /** 列表页用：只读不写心跳，不轮询（服务端已算好传入） */
  compact?: boolean;
}) {
  const { enabled, baseCount, windowMinutes, padToBase } = config;
  const [live, setLive] = useState<number | null>(null);
  // 每 10 秒随机浮动 ±(1~10)（钳制 ±15 内），数字有自然起伏；真实轮询到新值时以真实为准
  const [drift, setDrift] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      setDrift(d => {
        const step = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 10));
        return Math.max(-15, Math.min(15, d + step));
      });
    }, 10_000);
    return () => clearInterval(t);
  }, [enabled]);

  const beat = useRef(() => {
    try {
      let vid = localStorage.getItem('kv_visitor') || '';
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem('kv_visitor', vid);
      }
      const payload = JSON.stringify({ visitorId: vid, handle: handle || '', windowMinutes });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/visitors', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {});
      }
    } catch {}
  });

  // 心跳与轮询：只在详情页进行；compact（列表页）只展示服务端传入的值
  useEffect(() => {
    if (!enabled || compact) return;
    beat.current();
    const t = setInterval(() => beat.current(), 60_000);
    return () => clearInterval(t);
  }, [enabled, compact, beat]);

  useEffect(() => {
    if (!enabled || compact) return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch('/api/visitors?window=' + windowMinutes, { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        const n = handle ? Number(j.byHandle?.[handle] ?? 0) : Number(j.overall ?? 0);
        setLive(n);
        setDrift(0);
      } catch {}
    };
    // 上报后稍等再拉，避免把自己算进去之前就取数
    const t0 = setTimeout(pull, 1200);
    const t1 = setInterval(pull, 30_000);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(t1);
    };
  }, [enabled, compact, handle, windowMinutes]);

  if (!enabled) return null;

  const actual = live ?? real;
  const padded = padToBase && actual < baseCount;
  const shown = padded ? baseCount : actual;
  // 轮询到新的真实值时重置漂移（真实变化优先于随机浮动）
  const drifted = Math.max(1, shown + drift); // 最低显示 1，避免出现「0 人正在浏览」

  // 前台只显示数字，不暴露任何「补足 / 演示」痕迹。
  // 真实值与补足规则仅在后台设置页向管理员说明。
  return (
    <span className={`live${compact ? ' live-compact' : ''}`}>
      <i className="live-dot" aria-hidden />
      {padded ? `${drifted}+` : drifted} 人正在浏览
    </span>
  );
}
