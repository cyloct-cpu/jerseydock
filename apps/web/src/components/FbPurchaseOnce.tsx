'use client';

import { useEffect, useRef } from 'react';
import { fbPurchase } from '@/lib/fbpixel';

/** 在线支付回跳页的 Meta Pixel Purchase（服务端确认已支付后挂载；防重复） */
export function FbPurchaseOnce({ orderNo, totalUsd, items }: { orderNo: string; totalUsd?: number; items?: number }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !orderNo) return;
    sent.current = true;
    fbPurchase(typeof totalUsd === 'number' ? totalUsd : 0, orderNo, items || 1);
  }, [orderNo, totalUsd, items]);
  return null;
}
