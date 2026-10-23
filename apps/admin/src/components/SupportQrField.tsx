'use client';

import { useRef, useState } from 'react';

/** 客服二维码上传字段：上传后写入隐藏 input（name=supportQr），保存即持久化 */
export function SupportQrField({ value }: { value: string }) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      // 走 /api/upload 路由（Server Action 有 1MB 请求体上限）
      const res = await fetch('/api/upload?kind=contact', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok && data.url) setUrl(data.url);
      else setErr(data.error || '上传失败');
    } catch {
      setErr('上传失败');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="supportQr" value={url} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="客服二维码"
          style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--line)', background: '#fff' }}
        />
      ) : (
        <div
          style={{
            width: 140, height: 140, borderRadius: 4, border: '1px dashed var(--line-2)',
            display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 'var(--fs-micro)', textAlign: 'center', padding: 8,
          }}
        >
          未上传二维码
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? '上传中…' : url ? '更换图片' : '上传图片'}
        </button>
        {url && (
          <button type="button" className="btn btn-ghost" onClick={() => setUrl('')}>
            移除
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      {err && <span style={{ color: 'var(--bad, #c0392b)', fontSize: 'var(--fs-micro)' }}>{err}</span>}
      <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7, margin: 0 }}>
        前台左下角悬浮「联系客服」按钮会展示此二维码（手机扫码联系客服）。留空则自动用 WhatsApp 链接生成二维码。
      </p>
    </div>
  );
}
