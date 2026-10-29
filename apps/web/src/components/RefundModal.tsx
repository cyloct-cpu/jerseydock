'use client';

import { useEffect } from 'react';
import { useT } from '@/lib/store';

/**
 * 退款申请弹窗
 * - 主路径：跳转 WhatsApp 深链（预填订单号），并附同链接二维码（手机扫码用）
 * - 二维码走 goqr.me 外链服务（仅编码公开联系链接）；加载失败自动降级为文字链接
 * - 后台未配置 WhatsApp 时，降级为客服邮箱（含订单号主题）
 */
export function RefundModal({
  open,
  onClose,
  orderNo,
  whatsapp,
  supportEmail,
}: {
  open: boolean;
  onClose: () => void;
  orderNo: string;
  whatsapp: string;
  supportEmail: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const t = useT();

  if (!open) return null;

  const waDigits = (whatsapp || '').replace(/\D/g, '');
  const waMessage = `Hello! I'd like to request a refund for my order ${orderNo}.`;
  const waUrl = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}`
    : '';
  const qrUrl = waUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(waUrl)}`
    : '';
  const mailSubject = `Refund request — order ${orderNo}`;
  const mailUrl = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(mailSubject)}`
    : '';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(5,5,6,0.72)', backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', padding: 20,
      }}
    >
      <div
        className="panel panel-pad"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request a refund"
        style={{ maxWidth: 400, width: '100%', position: 'relative' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 4 }}
        >
          ×
        </button>

        <span className="eyebrow">Refund</span>
        <h3 className="h2" style={{ fontSize: 20, marginTop: 8 }}>{t('rf.request')}</h3>
        <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-small)', lineHeight: 1.75 }}>
          {t('rf.desc')}
          <span className="mono" style={{ color: 'var(--text-2)' }}> {orderNo}</span>
        </p>

        {waUrl ? (
          <div style={{ marginTop: 18, display: 'grid', gap: 14, justifyItems: 'center' }}>
            <a className="btn" href={waUrl} target="_blank" rel="noopener noreferrer" style={{ width: '100%' }}>
              {t('rf.wa_btn')}
            </a>
            {qrUrl && (
              <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt={`WhatsApp QR code for order ${orderNo}`}
                  width={160}
                  height={160}
                  style={{ borderRadius: 3, background: '#fff', padding: 6 }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{t('rf.qr_hint')}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 'var(--fs-small)', color: 'var(--text-2)', lineHeight: 1.7 }}>
              {t('rf.wa_missing')}
              {mailUrl
                ? <>{t('rf.mail_lead')}</>
                : t('rf.admin_hint')}
            </p>
            {mailUrl && (
              <a className="btn" href={mailUrl} style={{ marginTop: 12, width: '100%' }}>
                {t('rf.mail_btn')}
              </a>
            )}
          </div>
        )}

        <p className="dim" style={{ marginTop: 16, fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
          {t('rf.timing_note')}
        </p>
      </div>
    </div>
  );
}
