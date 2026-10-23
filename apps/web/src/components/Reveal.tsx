'use client';

import { useEffect, useRef } from 'react';

/** 克制的入场动效：opacity + translateY(16px)，560ms，ease-out-expo */
export function Reveal({ children, delay = 0, as: Tag = 'div' }: { children: React.ReactNode; delay?: number; as?: 'div' | 'section' | 'li' }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }),
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Comp = Tag as 'div';
  return (
    <Comp ref={ref as React.Ref<HTMLDivElement>} className="reveal" style={{ ['--d' as string]: `${delay}ms` }}>
      {children}
    </Comp>
  );
}
