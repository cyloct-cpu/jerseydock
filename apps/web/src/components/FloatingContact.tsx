'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/store';

/**
 * 悬浮「联系客服」按钮
 * - 可拖动，松手后自动吸附到最近的左右边缘
 * - 悬浮或点击弹出面板；弹出后常驻，不会因鼠标移开自动消失
 * - 收起方式：再次点击按钮，或点击面板与按钮以外的空白处
 * - 弹窗方向自适应：按钮在屏幕左半边 → 向右弹出；右半边 → 向左弹出
 * - 内容：WhatsApp 直连 + 二维码（后台上传图 > 由 WhatsApp 链接生成）；仅配置了真实邮箱时才显示邮箱入口
 */
const SIZE = 64;
const MARGIN = 12;

export function FloatingContact({
  whatsapp,
  supportQr,
  supportEmail,
}: {
  whatsapp: string;
  supportQr: string;
  supportEmail: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [snapping, setSnapping] = useState(false);
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 默认贴左下角
  useEffect(() => {
    if (pos) return;
    setPos({ x: MARGIN, y: Math.max(MARGIN, window.innerHeight - SIZE - 24) });
  }, [pos]);

  // 根据横向位置决定弹窗方向
  useEffect(() => {
    if (!pos) return;
    setSide(pos.x + SIZE / 2 <= window.innerWidth / 2 ? 'left' : 'right');
  }, [pos]);

  // 弹出期间：点击按钮与面板以外的空白处关闭（面板内点击不受影响）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const clampY = (y: number) => Math.min(window.innerHeight - SIZE - MARGIN, Math.max(MARGIN, y));

  const onPointerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: rect.left, baseY: rect.top, moved: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const x = Math.min(window.innerWidth - SIZE - MARGIN, Math.max(MARGIN, d.baseX + dx));
    setPos({ x, y: clampY(d.baseY + dy) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // 未拖动视为点击 → 切换弹窗
      setOpen(v => !v);
      return;
    }
    // 拖动结束 → 吸附到最近的左右边缘
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + SIZE / 2;
    const targetX = centerX <= window.innerWidth / 2 ? MARGIN : window.innerWidth - SIZE - MARGIN;
    setSnapping(true);
    setPos({ x: targetX, y: clampY(rect.top) });
    window.setTimeout(() => setSnapping(false), 400);
  };

  const waDigits = (whatsapp || '').replace(/\D/g, '');
  const waUrl = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(t('rf.wa_msg'))}`
    : '';
  const qrUrl = supportQr
    ? supportQr
    : waUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(waUrl)}`
      : '';
  // 只有配置了真实邮箱（非占位符）才显示邮箱入口
  const mailUrl = supportEmail && !/STORE_DOMAIN/i.test(supportEmail) ? `mailto:${supportEmail}` : '';

  const wrapStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: MARGIN, bottom: 24 };

  return (
    <div
      ref={wrapRef}
      className={`float-contact-wrap${snapping ? ' snapping' : ''}`}
      style={{ position: 'fixed', ...wrapStyle, zIndex: 180 }}
      onMouseEnter={() => setOpen(true)}
    >
      <button
        type="button"
        className="float-contact"
        aria-label="Contact customer service"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="float-contact-ico" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="float-pop"
          role="dialog"
          aria-label="Customer service options"
          style={side === 'right' ? { left: 'auto', right: 0 } : undefined}
        >
          <span className="eyebrow">{t('fs.eyebrow')}</span>
          <p className="float-hint">建议下单之前先联系客服，确认尺码与库存。</p>

          {waUrl ? (
            <a className="btn float-wa" href={waUrl} target="_blank" rel="noopener noreferrer">
              通过 WhatsApp 联系客服 ↗
            </a>
          ) : (
            <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7, margin: '0 0 4px' }}>
              WhatsApp 客服号尚未配置（后台「商店设置 · 联系客服」中填写后，此处显示直连按钮与二维码）。
            </p>
          )}

          {qrUrl ? (
            <div className="float-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="Customer service QR code"
                width={160}
                height={160}
                style={{ borderRadius: 4, background: '#fff', padding: 6 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <span>{t('fs.qr_hint')}</span>
            </div>
          ) : null}

          {mailUrl ? (
            <a className="float-mail" href={mailUrl}>
              发邮件给客服：{supportEmail}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
