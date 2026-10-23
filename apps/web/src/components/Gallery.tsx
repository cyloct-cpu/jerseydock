'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 商品图集
 *  · 自适应：主图按原始比例完整显示（contain），不裁切；窄图不拉伸变形
 *  · 放大：点击主图 / 缩略图进入全屏灯箱，支持键盘与滚轮缩放
 *  · 无限：缩略图横向滑动，不限制张数（超出自动换行/滚动）
 */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const list = images.filter(Boolean);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const count = list.length;
  const go = useCallback((i: number) => {
    if (!count) return;
    setActive((i + count) % count);
  }, [count]);

  const open = useCallback((i: number) => {
    setActive(i);
    setZoom(1);
    setLightbox(true);
  }, []);

  const close = useCallback(() => {
    setLightbox(false);
    setZoom(1);
  }, []);

  // 灯箱内：键盘导航 + 滚轮缩放 + 背景滚动锁定
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') { go(active + 1); setZoom(1); }
      else if (e.key === 'ArrowLeft') { go(active - 1); setZoom(1); }
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(4, z + 0.25));
      else if (e.key === '-') setZoom(z => Math.max(1, z - 0.25));
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
      setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      document.body.style.overflow = prev;
    };
  }, [lightbox, active, go, close]);

  if (!count) {
    return (
      <div
        className="gallery-empty"
        style={{ height: 'clamp(420px, 68vh, 760px)' }}
      >
        暂无图片
      </div>
    );
  }

  return (
    <>
      <div className={`gallery${count > 1 ? ' has-thumbs' : ''}`}>
        {/* 主图：固定高度舞台，图片按原始比例 contain 完整显示 */}
        <button
          type="button"
          className="g-main"
          onClick={() => open(active)}
          aria-label="放大查看主图"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[active]} alt={`${title} ${active + 1}`} className="g-main-img" />
          <span className="g-zoom-hint" aria-hidden>点击放大</span>
          {count > 1 && (
            <span className="g-counter" aria-live="polite">{active + 1} / {count}</span>
          )}
        </button>

        {/* 缩略图：脱离文档流固定在图集底部，主图比例变化时位置不动 */}
        {count > 1 && (
          <div className="g-thumbs" ref={trackRef} role="list" aria-label="图片列表">
            {list.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                role="listitem"
                aria-label={`查看第 ${i + 1} 张`}
                aria-current={i === active}
                className={`g-thumb${i === active ? ' on' : ''}`}
                onClick={() => go(i)}
                onDoubleClick={() => open(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 灯箱 */}
      {lightbox && (
        <div
          className="lb"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} 图片预览`}
          onClick={close}
          onWheel={e => {
            if (Math.abs(e.deltaY) >= 2) setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));
          }}
        >
          <button className="lb-close" onClick={close} aria-label="关闭" type="button">✕</button>
          {count > 1 && (
            <>
              <button
                className="lb-nav lb-prev"
                onClick={e => { e.stopPropagation(); go(active - 1); setZoom(1); }}
                aria-label="上一张"
                type="button"
              >
                ‹
              </button>
              <button
                className="lb-nav lb-next"
                onClick={e => { e.stopPropagation(); go(active + 1); setZoom(1); }}
                aria-label="下一张"
                type="button"
              >
                ›
              </button>
            </>
          )}

          <div
            className={`lb-stage${zoom > 1 ? ' zoomed' : ''}`}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => {
              dragStart.current = { x: e.clientX, y: e.clientY };
              setDrag({ x: 0, y: 0 });
            }}
            onMouseMove={e => {
              if (!dragStart.current) return;
              setDrag({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
            }}
            onMouseUp={() => { dragStart.current = null; }}
            onMouseLeave={() => { dragStart.current = null; setDrag(null); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={list[active]}
              alt={`${title} ${active + 1}`}
              style={{
                transform: `translate(${drag?.x ?? 0}px, ${drag?.y ?? 0}px) scale(${zoom})`,
              }}
            />
          </div>

          <div className="lb-foot" onClick={e => e.stopPropagation()}>
            <span className="lb-count">{active + 1} / {count}</span>
            <div className="lb-strip">
              {list.map((src, i) => (
                <button
                  key={`lb-${src}-${i}`}
                  type="button"
                  className={`lb-thumb${i === active ? ' on' : ''}`}
                  onClick={() => { go(i); setZoom(1); }}
                  aria-label={`第 ${i + 1} 张`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
            <span className="lb-hint">滚轮缩放 · 拖拽移动 · ← → 切换 · Esc 关闭</span>
          </div>
        </div>
      )}
    </>
  );
}
