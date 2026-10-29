'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/store';
import { ProductCard } from './ProductCard';
import type { SlimProduct } from '@kitvault/shared';

export type ImageSearchHit = { product: SlimProduct; score: number; exact: boolean };

const MAX_BYTES = 5 * 1024 * 1024;
const IMG_EXTS = /\.(jpe?g|png|webp|avif)$/i;

/**
 * 以图搜款面板（跟随头部搜索框下方展开，非全屏弹窗）
 * - 点击 / 拖拽 / 粘贴（Ctrl+V）上传，移动端可即拍即传
 * - 结果：两列商品卡 + 相似度角标（exact → 「同款」；视觉通道来源有标注）
 * - 关闭：点搜索框外空白（HeaderSearch 统一处理）/ Esc / 右上角 ×
 */
export function ImageSearchModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'searching' | 'results' | 'empty' | 'error'>('idle');
  const [hits, setHits] = useState<ImageSearchHit[]>([]);
  const [source, setSource] = useState<'clip' | 'vision' | 'none'>('none');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 粘贴上传（桌面端核心体验）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            void upload(file);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function upload(file: File) {
    if (!IMG_EXTS.test(file.name)) {
      setError(t('search.image_formats'));
      setState('error');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('search.image_formats'));
      setState('error');
      return;
    }
    setState('searching');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/search/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'failed');
      if (data.hits?.length) {
        setHits(data.hits);
        setSource(data.source || 'clip');
        setState('results');
      } else {
        setState('empty');
      }
    } catch {
      setError(t('search.image_error'));
      setState('error');
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  return (
    <div
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 95,
        width: 'min(430px, calc(100vw - 32px))', maxHeight: 'min(66vh, 560px)', overflow: 'auto',
        background: 'var(--bg, #101012)', border: '1px solid var(--line-2)', borderRadius: 6,
        boxShadow: '0 18px 46px rgba(0,0,0,0.5)',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 14px 10px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>{t('search.image_title')}</span>
          <p className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4 }}>{t('search.image_desc')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" title="Close"
          style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 2 }}>
          ×
        </button>
      </div>

      {/* 主体 */}
      <div style={{ padding: 14 }}>
        {state === 'idle' && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--line-2)'}`,
              background: dragOver ? 'var(--accent-dim)' : 'transparent',
              borderRadius: 4, padding: '26px 14px', textAlign: 'center', cursor: 'pointer',
              transition: 'border-color .2s, background .2s',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px' }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--text)', fontWeight: 500 }}>{t('search.image_drop')}</div>
            <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 6 }}>{t('search.image_formats')}</div>
          </div>
        )}

        {state === 'searching' && (
          <div style={{ padding: '36px 0', textAlign: 'center' }}>
            <div className="imgsearch-spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--text-2)', fontSize: 'var(--fs-small)' }}>{t('search.image_searching')}</div>
          </div>
        )}

        {state === 'results' && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text)' }}>
                {t('search.image_results').replace('{n}', String(hits.length))}
              </span>
              {source === 'vision' && (
                <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{t('search.image_vision_note')}</span>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState('idle')}>{t('search.image_reupload')}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {hits.map(hit => (
                <div key={hit.product.h} style={{ position: 'relative' }}>
                  <ProductCard product={hit.product} />
                  <span style={{
                    position: 'absolute', top: 6, left: 6, zIndex: 2,
                    fontSize: 10, padding: '2px 6px', borderRadius: 2, letterSpacing: '0.04em',
                    background: hit.exact ? 'var(--accent)' : 'rgba(10,10,11,0.78)',
                    color: hit.exact ? '#0A0A0B' : '#F5F3EF',
                    border: hit.exact ? 'none' : '1px solid var(--line-2)',
                  }}>
                    {hit.exact ? t('search.image_exact') : t('search.image_match').replace('{n}', String(Math.round(hit.score * 100)))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {state === 'empty' && (
          <div style={{ padding: '30px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--text)', fontWeight: 500 }}>{t('search.image_empty')}</div>
            <p className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 6 }}>{t('search.image_empty_hint')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <Link className="btn btn-sm" href="/collections/2026-27-season" onClick={onClose}>{t('img.new_season')}</Link>
              <Link className="btn btn-ghost btn-sm" href="/collections/retro" onClick={onClose}>{t('img.retro')}</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState('idle')}>{t('search.image_reupload')}</button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div style={{ padding: '30px 10px', textAlign: 'center' }}>
            <div style={{ color: '#E5484D', fontSize: 'var(--fs-small)' }}>{error}</div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setState('idle')}>{t('search.image_reupload')}</button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
