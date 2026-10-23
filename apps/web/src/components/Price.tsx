'use client';

import { useStore } from '@/lib/store';
import { format } from '@kitvault/shared';

/** 价格（USD 基准 → 当前币种换算），前台通用 */
export function Price({ usd }: { usd: number }) {
  const { currency, rates } = useStore();
  return <>{format(usd, currency, rates[currency])}</>;
}
