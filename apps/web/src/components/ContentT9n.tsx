'use client';

import { useEffect, useState } from 'react';
import { useStore, useT } from '@/lib/store';

/**
 * 商品内容按语言翻译（客户端替换显示）
 * - locale = en 时原样；其他语言挂载后请求 /api/mt/content（服务端懒翻译 + 缓存）
 * - 替换目标：详情页 h1（#pdp-title）与描述段（#pdp-desc）
 */
export function ProductContentT9n({ handle, description }: { handle: string; description: string }) {
  const { locale } = useStore();
  const [data, setData] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (locale === 'en' || !handle) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mt/content?handle=${encodeURIComponent(handle)}&locale=${encodeURIComponent(locale)}`);
        const j = await res.json();
        if (alive && j.ok) setData({ title: j.title, description: j.description });
      } catch { /* 翻译失败保留原文 */ }
    })();
    return () => { alive = false; };
  }, [handle, locale]);

  useEffect(() => {
    if (!data) return;
    const h1 = document.getElementById('pdp-title');
    if (h1 && data.title) h1.textContent = data.title;
    const desc = document.getElementById('pdp-desc');
    if (desc && data.description) desc.textContent = data.description;
  }, [data]);

  return null;
}

/**
 * 零散文本翻译（分类标题等）：locale = en 时原样显示
 */
export function TextT9n({ text }: { text: string }) {
  const { locale } = useStore();
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (locale === 'en' || !text) { setOut(text); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/mt/content?text=${encodeURIComponent(text)}&locale=${encodeURIComponent(locale)}`);
        const j = await res.json();
        if (alive && j.ok && j.text) setOut(j.text);
      } catch { /* 保留原文 */ }
    })();
    return () => { alive = false; };
  }, [text, locale]);

  return <>{out}</>;
}

/** 静态词条翻译（服务端页面内联使用；走运行时词典，含 MT 补全） */
export function T({ k, values }: { k: string; values?: Record<string, string | number> }) {
  const t = useT();
  let out = t(k);
  if (values) for (const [vk, vv] of Object.entries(values)) out = out.replaceAll(`{${vk}}`, String(vv));
  return <>{out}</>;
}
