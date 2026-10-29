'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';

/**
 * 城市建议名本地化（客户端）
 * 把 AutoComplete 的城市选项（英文）按当前语言经 /api/mt/cities 机翻，
 * 返回 display 映射供 AutoComplete 展示 + 匹配（用户输入本地语言也能命中城市）。
 * 提交值保持英文规范名（物流依赖）；locale=en 或无翻译时映射为空。
 */
export function useCityDisplay(cityOptions: string[]): Record<string, string> {
  const { locale } = useStore();
  const [display, setDisplay] = useState<Record<string, string>>({});
  const key = useMemo(() => cityOptions.join('|'), [cityOptions]);

  useEffect(() => {
    if (locale === 'en' || !cityOptions.length) { setDisplay({}); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mt/cities?locale=${encodeURIComponent(locale)}&names=${encodeURIComponent(cityOptions.join(','))}`);
        const j = await res.json();
        if (alive && j.ok) setDisplay(j.map || {});
      } catch { /* 翻译失败显示原文 */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale]);

  return display;
}
