'use client';

import { useEffect, useRef } from 'react';
import { trackView } from '@/lib/track';

/** 商品页浏览埋点（客户端）。曾在服务端组件里直调 trackView —— track() 在无 window 时静默返回，
 *  导致 view_product 从未上报（漏斗"浏览商品 0"、看板"浏览最多的商品"永远为空）。 */
export function TrackView({ handle }: { handle: string }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    return trackView(handle);
  }, [handle]);
  return null;
}
