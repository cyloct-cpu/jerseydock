'use client';

import { useEffect, useRef } from 'react';
import { trackView } from '@/lib/track';
import { fbViewContent } from '@/lib/fbpixel';

/** 商品页浏览埋点（客户端）。曾在服务端组件里直调 trackView —— track() 在无 window 时静默返回，
 *  导致 view_product 从未上报（漏斗"浏览商品 0"、看板"浏览最多的商品"永远为空）。 */
export function TrackView({ handle, title, priceUsd }: { handle: string; title?: string; priceUsd?: number }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Meta Pixel ViewContent（未配置像素时 fbq 不存在，静默跳过）
    if (title && typeof priceUsd === 'number') fbViewContent(handle, title, priceUsd);
    return trackView(handle);
  }, [handle, title, priceUsd]);
  return null;
}
