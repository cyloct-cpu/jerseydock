'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', orderNo: '', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Send failed');
      track({ type: 'contact_submit', email: form.email, meta: { orderNo: form.orderNo || undefined } });
      setState('done');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  if (state === 'done') {
    return (
      <div className="panel panel-pad" style={{ marginTop: 22 }}>
        <b style={{ color: 'var(--accent)', fontWeight: 500 }}>Message received.</b>
        <p className="dim" style={{ marginTop: 8 }}>We reply within one business day — check your spam folder just in case.</p>
      </div>
    );
  }

  return (
    <form className="panel panel-pad" onSubmit={submit} style={{ marginTop: 22 }}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input id="c-name" className="input" required value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" className="input" type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="c-order">Order number (optional)</label>
          <input id="c-order" className="input" value={form.orderNo} onChange={set('orderNo')} placeholder="KV-XXXXXX" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="c-message">Message</label>
          <textarea id="c-message" className="input" required rows={5} value={form.message} onChange={set('message')}
            style={{ height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
        </div>
      </div>
      <button className="btn" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send message'}
      </button>
      {state === 'error' && <p style={{ color: '#E5484D', fontSize: 'var(--fs-small)', marginTop: 10 }}>{error}</p>}
    </form>
  );
}
