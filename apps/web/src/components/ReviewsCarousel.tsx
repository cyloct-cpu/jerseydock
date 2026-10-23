'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Review } from '@/lib/brand';

/**
 * 客户评价轮播
 *  · 横向滑动 + 分页点，当前项居中放大
 *  · 顶部展示平均分与总条数
 *  · 内容为运营配置，非真实用户评价（后台与本页均不伪装为买家留评）
 */
export function ReviewsCarousel({
  reviews,
  title,
  subtitle,
}: {
  reviews: Review[];
  title: string;
  subtitle: string;
}) {
  const list = reviews.filter(r => r.content);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const go = useCallback((i: number) => {
    if (!list.length) return;
    setIndex((i + list.length) % list.length);
  }, [list.length]);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setIndex(i => (i + 1) % list.length), 6000);
    return () => clearInterval(t);
  }, [list.length]);

  // 滑动到当前项
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: 'smooth' });
  }, [index]);

  if (!list.length) return null;

  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;

  return (
    <section className="section rv-section" aria-labelledby="rv-title">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Reviews</span>
            <h2 className="h2" id="rv-title" style={{ marginTop: 8 }}>{title}</h2>
            {subtitle && <p className="dim" style={{ marginTop: 8, maxWidth: '52ch' }}>{subtitle}</p>}
          </div>
          <div className="rv-score">
            <Stars value={avg} size={14} />
            <span className="rv-avg">{avg.toFixed(1)}</span>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{list.length} 条评价</span>
          </div>
        </div>

        <div className="rv-viewport">
          <div className="rv-track" ref={trackRef}>
            {list.map((r, i) => (
              <figure className={`rv-card${i === index ? ' on' : ''}`} key={r.id || i}>
                <Stars value={r.rating} />
                <blockquote className="rv-text">{r.content}</blockquote>
                <figcaption className="rv-meta">
                  <span className="rv-avatar" aria-hidden>
                    {r.avatar
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.avatar} alt="" loading="lazy" />
                      : (r.name || 'C').trim().charAt(0).toUpperCase()}
                  </span>
                  <span>
                    <b>{r.name}</b>
                    <span className="dim" style={{ display: 'block', fontSize: 'var(--fs-micro)' }}>
                      {r.location || 'Verified buyer'}{r.date ? ` · ${r.date}` : ''}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        {list.length > 1 && (
          <div className="rv-dots" role="tablist" aria-label="评价切换">
            {list.map((r, i) => (
              <button
                key={r.id || i}
                role="tab"
                aria-selected={i === index}
                aria-label={`第 ${i + 1} 条评价`}
                className={`rv-dot${i === index ? ' on' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** 星级图标（半星用裁切实现） */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(5, value));
  const pct = (v / 5) * 100;
  return (
    <span className="stars" style={{ ['--s' as string]: `${size}px`, ['--p' as string]: `${pct}%` } as React.CSSProperties} aria-label={`${v.toFixed(1)} 分（满分 5 分）`}>
      <span className="stars-bg" aria-hidden>★★★★★</span>
      <span className="stars-fg" aria-hidden>★★★★★</span>
    </span>
  );
}
