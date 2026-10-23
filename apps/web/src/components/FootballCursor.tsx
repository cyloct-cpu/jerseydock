'use client';

import { useEffect, useRef } from 'react';

/**
 * 足球鼠标光标（需求 N5）
 * - SVG 足球跟随指针，带惯性（lerp）与滚动旋转
 * - hover 可交互元素：轻微放大 + 高亮描边
 * - 点击：8px 踢击位移，320ms
 * - 触屏设备 / prefers-reduced-motion：自动回退系统光标
 */
export function FootballCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    document.body.classList.add('ball-cursor');
    const el = ref.current;
    if (!el) return;

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let x = tx, y = ty, rot = 0, scale = 1;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX; ty = e.clientY;
      const target = e.target as HTMLElement | null;
      const interactive = !!target?.closest('a, button, select, input, [role="button"]');
      scale = interactive ? 1.28 : 1;
      el.style.opacity = interactive ? '1' : '0.9';
    };
    const onDown = () => { el.animate([{ transform: el.style.transform }, { transform: el.style.transform + ' translate(8px, 0)' }, { transform: el.style.transform }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' }); };

    const loop = () => {
      const dx = tx - x, dy = ty - y;
      x += dx * 0.18; y += dy * 0.18;
      rot += (Math.abs(dx) + Math.abs(dy)) * 0.35;
      el.style.transform = `translate3d(${x - 14}px, ${y - 14}px, 0) rotate(${rot}deg) scale(${scale})`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      cancelAnimationFrame(raf);
      document.body.classList.remove('ball-cursor');
    };
  }, []);

  return (
    <div ref={ref} className="ball-cursor-el" style={{ opacity: 0 }} aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" fill="#F1EFE8" />
        <path d="M16 6l5.5 4-2.1 6.4h-6.8L10.5 10z" fill="#0A0A0B" />
        <path d="M5.6 13.4l5.2 3.6-1.7 5.5-5.6-1.6z" fill="#0A0A0B" opacity=".9" />
        <path d="M26.4 13.4l-5.2 3.6 1.7 5.5 5.6-1.6z" fill="#0A0A0B" opacity=".9" />
        <path d="M11 27l4-4.4h10l4 4.4-2.6 2.6h-12.8z" fill="#0A0A0B" opacity=".9" />
        <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(10,10,11,.35)" strokeWidth="1" />
      </svg>
    </div>
  );
}
