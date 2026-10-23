'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/store';
import { Price } from './Price';
import { ImageSearchModal } from './ImageSearchModal';

type SearchHit = { h: string; t: string; v: string; p: number };

/**
 * 头部搜索框（文本搜索 + 以图搜款入口）
 * - 输入 ≥2 字符即时匹配（/api/search，250ms 防抖），下拉展示缩略图结果，点空白处 / Esc 收起
 * - 框内右侧相机按钮 = 以图搜款（大点击区，替代原易点错的小图标）
 */
export function HeaderSearch() {
  const t = useT();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  // 输入防抖查询
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setItems([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setItems(data.items || []);
        setOpen(true);
      } catch { /* 静默失败 */ } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // 点击框外收起下拉
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setImageOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // 聚焦时已有内容则重新展开下拉
  const focusInput = () => { if (q.trim().length >= 2) setOpen(true); };

  return (
    <div ref={boxRef} className="hdr-search" style={{ position: 'relative', flex: '0 1 460px', maxWidth: 460, minWidth: 180, marginInline: 'auto' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', height: 34,
          border: '1px solid var(--line-2)', borderRadius: 2, background: 'var(--surface-2, rgba(255,255,255,0.04))',
          overflow: 'hidden',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" style={{ margin: '0 8px 0 12px', flex: 'none' }} aria-hidden>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.currentTarget.value)}
          onFocus={focusInput}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 'var(--fs-small)', outline: 'none', height: '100%' }}
        />
        {/* 以图搜款入口（相机） */}
        <button
          type="button"
          onClick={() => { setOpen(false); setImageOpen(v => !v); }}
          title={t('search.image_title')}
          aria-label={t('search.image_title')}
          style={{
            flex: 'none', width: 36, height: 32, display: 'grid', placeItems: 'center', alignSelf: 'center', marginRight: 1,
            border: 'none', borderLeft: '1px solid var(--line-2)', background: 'transparent',
            color: 'var(--text-3)', cursor: 'pointer',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
      </div>

      {/* 文本搜索下拉 */}
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 95,
            background: 'var(--bg, #101012)', border: '1px solid var(--line-2)', borderRadius: 6,
            overflow: 'hidden', boxShadow: '0 18px 46px rgba(0,0,0,0.5)',
          }}
        >
          {loading && items.length === 0 && (
            <div className="dim" style={{ padding: '14px 16px', fontSize: 'var(--fs-small)' }}>{t('search.image_searching')}</div>
          )}
          {!loading && items.length === 0 && (
            <div className="dim" style={{ padding: '14px 16px', fontSize: 'var(--fs-small)' }}>{t('search.no_results')}</div>
          )}
          {items.map(hit => (
            <Link
              key={hit.h}
              href={`/products/${hit.h}`}
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: '1px solid var(--line)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hit.v} alt="" style={{ width: 34, height: 42, objectFit: 'cover', borderRadius: 2, flex: 'none', background: 'var(--surface-2)' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-small)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hit.t}
              </span>
              <span style={{ flex: 'none' }}><Price usd={hit.p} /></span>
            </Link>
          ))}
        </div>
      )}

      {imageOpen && <ImageSearchModal onClose={() => setImageOpen(false)} />}
    </div>
  );
}
