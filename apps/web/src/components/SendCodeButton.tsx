'use client';

import { useRef, useState } from 'react';
import { useT } from '@/lib/store';

/**
 * 「获取验证码」按钮：读取邮箱输入框的值 → POST /api/auth/send-code → 60 秒倒计时。
 * dev 模式（未配置 SMTP）下后端会回显验证码，直接展示给用户便于本地测试。
 */
export function SendCodeButton({
  emailId,
  purpose,
  email,
}: {
  /** 邮箱输入框的 DOM id（注册页从表单里读）；直接给 email 值时可不传 */
  emailId?: string;
  purpose: 'register' | 'password';
  /** 已知邮箱时直接传（如改密页取自会话） */
  email?: string;
}) {
  const [phase, setPhase] = useState<'idle' | 'sending' | 'countdown'>('idle');
  const t = useT();
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState('');
  const [msgBad, setMsgBad] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = () => {
    setPhase('countdown');
    setLeft(60);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft(v => {
        if (v <= 1) {
          if (timer.current) clearInterval(timer.current);
          setPhase('idle');
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const send = async () => {
    const el = emailId ? (document.getElementById(emailId) as HTMLInputElement | null) : null;
    const value = (email ?? el?.value ?? '').trim();
    if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setMsgBad(true); setMsg(t('search.no_results').slice(0, 0) || 'Invalid email'); return;
    }
    setPhase('sending'); setMsg('');
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, purpose }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsgBad(true); setMsg(data.error || '发送失败');
      } else if (data.mode === 'dev') {
        setMsgBad(false); setMsg(`开发模式（未配置 SMTP）— 验证码：${data.devCode}`);
        startCountdown();
      } else {
        setMsgBad(false); setMsg('验证码已发送，请查收邮箱（10 分钟内有效）');
        startCountdown();
      }
    } catch {
      setMsgBad(true); setMsg('发送失败，请重试');
    }
  };

  const disabled = phase === 'sending' || phase === 'countdown';
  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={send} style={{ width: '100%' }}>
        {phase === 'sending' ? t('pw.code_sending') : phase === 'countdown' ? t('pw.code_resend').replace('{s}', String(left)) : t('pw.code_get')}
      </button>
      {msg && (
        <span style={{ fontSize: 'var(--fs-micro)', color: msgBad ? '#E5484D' : 'var(--text-3)', display: 'block', marginTop: 6 }}>{msg}</span>
      )}
    </div>
  );
}
