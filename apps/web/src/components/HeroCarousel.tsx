'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { HeroConfig, HeroSlide } from '@/lib/brand';

/**
 * Hero 轮播（高端买手店气质）
 * - 全屏背景图交叉淡入（opacity），文字层同步切换
 * - 自动轮播（间隔后台可配），hover 暂停，页签隐藏时暂停
 * - 指示器为细线（非圆点），当前项金色加宽
 * - Ken Burns 漂移只作用于当前激活图，reduced-motion 时停用（CSS 处理）
 */
export function HeroCarousel({ config }: { config: HeroConfig }) {
  const slides = config.slides;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((i: number) => {
    setIndex(((i % slides.length) + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (!config.enabled || slides.length <= 1 || paused) return;
    timer.current = setInterval(() => {
      // 页签不可见时不切换，避免切回来瞬间跳图
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex(i => (i + 1) % slides.length);
    }, config.intervalMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [config.enabled, config.intervalMs, slides.length, paused]);

  if (!slides.length) return null;

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured collections"
    >
      <div className="hero-bg" aria-hidden>
        {slides.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.id}
            src={s.image}
            alt=""
            className={i === index ? 'on' : ''}
            fetchPriority={i === 0 ? 'high' : 'auto'}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ))}
        <i className="hero-scrim" />
      </div>

      <div className="hero-inner container">
        {slides.map((s, i) => (
          <HeroSlideContent key={s.id} slide={s} active={i === index} />
        ))}

        {config.enabled && slides.length > 1 && (
          <>
            <button
              type="button"
              className="hero-arrow hero-prev"
              aria-label="Previous slide"
              onClick={() => go(index - 1)}
            >
              <span aria-hidden>&lsaquo;</span>
            </button>
            <button
              type="button"
              className="hero-arrow hero-next"
              aria-label="Next slide"
              onClick={() => go(index + 1)}
            >
              <span aria-hidden>&rsaquo;</span>
            </button>
            <div className="hero-dots" role="tablist" aria-label="Slides">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1}`}
                  className={`hero-dot${i === index ? ' on' : ''}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** 单张 slide 的文字层（绝对定位堆叠，随激活态交叉淡入；非激活 slide 用 inert 移出焦点链） */
function HeroSlideContent({ slide, active }: { slide: HeroSlide; active: boolean }) {
  return (
    <div className={`hero-slide${active ? ' on' : ''}`} aria-hidden={!active} inert={!active}>
      {slide.eyebrow && (
        <span className="eyebrow hero-eyebrow">
          <i className="tick" aria-hidden />
          {slide.eyebrow}
        </span>
      )}
      <h1 className="hero-title">{slide.title}</h1>
      {slide.subtitle && <p className="hero-sub">{slide.subtitle}</p>}
      {(slide.ctaText || slide.cta2Text) && (
        <div className="hero-cta">
          {slide.ctaText && (
            <Link className="btn hero-btn" href={slide.ctaHref || '#'} tabIndex={active ? 0 : -1}>
              {slide.ctaText} <span className="arr" aria-hidden>&rarr;</span>
            </Link>
          )}
          {slide.cta2Text && (
            <Link className="hero-link" href={slide.cta2Href || '#'} tabIndex={active ? 0 : -1}>
              {slide.cta2Text}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
