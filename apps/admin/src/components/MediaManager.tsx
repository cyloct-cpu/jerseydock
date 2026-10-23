'use client';

import { useEffect, useRef, useState } from 'react';
import { validateImage, imgRuleHint } from '@/lib/image-rules';

export type MediaItem = {
  url: string;
  name: string;
  size: number;
  source: string;
  uploadedAt: string;
};

type ListResp = { ok: boolean; items?: MediaItem[]; total?: number; error?: string };

/** 上传走 /api/upload 路由（Server Action 有 1MB 请求体上限，大图会失败） */
const uploadMediaFiles = async (fd: FormData) => {
  const res = await fetch('/api/upload?kind=media', { method: 'POST', body: fd });
  return res.json() as Promise<{ ok: boolean; urls?: string[]; error?: string }>;
};

function fmtSize(n: number): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const SOURCE_LABELS: Record<string, string> = {
  product: '商品图',
  hero: 'Hero 轮播',
  contact: '客服码',
  media: '图库上传',
  sync: '自动收录',
  catalog: '商品主图',
};

/** 来源筛选（catalog 是商品主图条目，单独一类；其余统称本地上传） */
const SOURCE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'local', label: '本地上传' },
  { value: 'catalog', label: '商品主图' },
];

/**
 * 图库管理：搜索 / 来源筛选 / 分页与页码跳转 / 多选批量删除 / 上传 / 大图预览。
 * 列表走 /api/media/list 分页拉取（商品主图条目 3.7k+，不能整页渲染）；
 * 首屏数据来自服务端组件（initial），之后的筛选翻页由客户端拉取。
 * 商品主图条目（catalog）是在售商品引用的图片，仅可复制链接与预览，不可选中删除。
 */
export function MediaManager({
  initial,
  initialTotal,
  pageSize = 60,
}: {
  initial: MediaItem[];
  initialTotal: number;
  pageSize?: number;
}) {
  const [items, setItems] = useState<MediaItem[]>(initial);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [copied, setCopied] = useState('');
  const [pendingDel, setPendingDel] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [pageJump, setPageJump] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const firstRun = useRef(true);

  // 搜索输入 300ms 防抖后生效，并回到第 1 页
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);
  useEffect(() => { setPage(1); }, [q, source]);

  const load = async (p: number, src: string, query: string) => {
    setLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (src) params.set('source', src);
      if (query) params.set('q', query);
      const res = await fetch(`/api/media/list?${params.toString()}`);
      const data: ListResp = await res.json();
      if (res.ok && data.ok && data.items) {
        setItems(data.items);
        setTotal(data.total || 0);
      } else {
        setListError(data.error || '列表加载失败');
      }
    } catch {
      setListError('列表加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 首屏由服务端渲染（initial），之后的筛选 / 翻页走接口；列表刷新时清空选择
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSelected(new Set());
    void load(page, source, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, source, q]);

  // 大图预览：Esc 关闭
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadError('');
    const valid: File[] = [];
    const invalid: string[] = [];
    for (const f of Array.from(files)) {
      const err = await validateImage(f, 'media');
      if (err) invalid.push(err);
      else valid.push(f);
    }
    if (!valid.length) { setUploadError(invalid.join('；')); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      valid.forEach(f => fd.append('files', f));
      const res = await uploadMediaFiles(fd);
      if (!res.ok) setUploadError(res.error || '上传失败');
      if (invalid.length) setUploadError(prev => [prev, invalid.join('；')].filter(Boolean).join('；'));
      // 上传成功后刷新当前列表（新上传排在本地上传最前）
      if (res.ok) { void load(page, source, q); }
    } catch {
      setUploadError('上传失败，请重试');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(new URL(url, location.origin).href);
      setCopied(url);
      setTimeout(() => setCopied(c => (c === url ? '' : c)), 1500);
    } catch { /* 剪贴板不可用 */ }
  };

  const confirmDelete = async () => {
    if (!pendingDel) return;
    setDelBusy(true);
    setDelError('');
    try {
      const res = await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: pendingDel }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPendingDel('');
        if (preview?.url === pendingDel) setPreview(null);
        void load(page, source, q);
      } else {
        setDelError(data.error || '删除失败');
      }
    } catch {
      setDelError('删除失败，请重试');
    } finally {
      setDelBusy(false);
    }
  };

  const toggleSel = (url: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(url)) n.delete(url); else n.add(url);
      return n;
    });
  };

  /** 批量删除：逐张走删除接口（服务端有引用保护与鉴权） */
  const batchDelete = async () => {
    const targets = items.filter(i => selected.has(i.url) && i.source !== 'catalog').map(i => i.url);
    if (!targets.length) return;
    setBatchBusy(true);
    let okN = 0;
    let lastErr = '';
    for (const url of targets) {
      try {
        const res = await fetch('/api/media/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const j = await res.json();
        if (res.ok && j.ok) okN++;
        else lastErr = j.error || '删除失败';
      } catch {
        lastErr = '网络异常，删除失败';
      }
    }
    setBatchBusy(false);
    setSelected(new Set());
    setBatchMsg(lastErr ? `删除完成：成功 ${okN} 张，失败 ${targets.length - okN} 张（${lastErr}）` : `已删除 ${okN} 张`);
    setTimeout(() => setBatchMsg(''), 5000);
    void load(page, source, q);
  };

  const jumpTo = () => {
    const n = Math.max(1, Math.min(totalPages, Number(pageJump) || 0));
    setPage(n);
    setPageJump('');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const localOnPage = items.filter(i => i.source !== 'catalog').length;
  const selActive = selected.size > 0;

  return (
    <div className="a-card a-card-pad">
      {/* 搜索 + 来源筛选 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="search"
          value={qInput}
          onChange={e => setQInput(e.currentTarget.value)}
          placeholder="搜索图片名称 / 链接…"
          style={{ flex: '0 1 280px', padding: '7px 12px', border: '1px solid var(--line-2)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 'var(--fs-small)' }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setSource(f.value)}
              style={{
                border: '1px solid ' + (source === f.value ? 'var(--accent)' : 'var(--line-2)'),
                color: source === f.value ? 'var(--accent)' : 'var(--text-2)',
                background: 'transparent',
                borderRadius: 999,
                padding: '4px 14px',
                fontSize: 'var(--fs-small)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="dim" style={{ fontSize: 'var(--fs-micro)', marginLeft: 'auto' }}>
          {loading ? '加载中…' : `共 ${total} 张 · 本页 ${items.length} 张`}
        </span>
      </div>

      {/* 多选操作条 */}
      {selActive && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, padding: '8px 12px', border: '1px solid var(--accent)', borderRadius: 4, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 'var(--fs-small)' }}>已选 {selected.size} 张</b>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSelected(new Set(items.filter(i => i.source !== 'catalog').map(i => i.url)))}>
            全选本页（本页可删 {localOnPage} 张）
          </button>
          <button className="btn btn-sm" type="button" disabled={batchBusy} onClick={batchDelete} style={{ background: '#E5484D', borderColor: '#E5484D', color: '#fff' }}>
            {batchBusy ? '删除中…' : `批量删除 ${selected.size} 张`}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSelected(new Set())}>取消选择</button>
          {batchMsg && <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>{batchMsg}</span>}
        </div>
      )}

      {items.length ? (
        <div className="media-grid">
          {items.map(item => {
            const isCatalog = item.source === 'catalog';
            const sel = selected.has(item.url);
            return (
              <div key={item.url} className={`media-card${sel ? ' media-card-sel' : ''}`}>
                <div className="media-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    title="点击放大预览"
                    onClick={() => setPreview(item)}
                  />
                  <span className="media-badge">{SOURCE_LABELS[item.source] || item.source}</span>
                  {!isCatalog && (
                    <label className="media-check" title="选择" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSel(item.url)} />
                    </label>
                  )}
                </div>
                <div className="media-acts">
                  <button type="button" className="media-act" onClick={() => copyUrl(item.url)} title="复制图片访问链接">
                    {copied === item.url ? '已复制 ✓' : '复制链接'}
                  </button>
                  {!isCatalog && (
                    <button
                      type="button"
                      className="media-act media-act-danger"
                      onClick={() => setPendingDel(item.url)}
                      title="删除文件与索引"
                    >
                      删除
                    </button>
                  )}
                  <button type="button" className="media-act" onClick={() => setPreview(item)} title="放大预览">
                    预览
                  </button>
                </div>
                <div className="media-name" title={item.name}>{item.name}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dim" style={{ padding: '40px 0', textAlign: 'center', fontSize: 'var(--fs-small)' }}>
          {loading ? '加载中…' : '没有匹配的图片 — 换个关键词，或点击下方「上传图片」。'}
        </div>
      )}
      {listError && (
        <div style={{ marginTop: 8, fontSize: 'var(--fs-small)', color: '#E5484D' }}>{listError}</div>
      )}

      {/* 分页 + 页码跳转 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>
            上一页
          </button>
          <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>第 {page} / {totalPages} 页 · 本页 {items.length} 张</span>
          <button className="btn btn-ghost btn-sm" type="button" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
            下一页
          </button>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
            <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>跳至</span>
            <input
              className="input"
              type="number"
              min={1}
              max={totalPages}
              value={pageJump}
              onChange={e => setPageJump(e.currentTarget.value)}
              onKeyDown={e => { if (e.key === 'Enter') jumpTo(); }}
              style={{ width: 72, height: 30, textAlign: 'center' }}
            />
            <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>页</span>
            <button className="btn btn-ghost btn-sm" type="button" disabled={loading} onClick={jumpTo}>跳转</button>
          </span>
        </div>
      )}

      {/* 删除确认（destructive：先确认再提交） */}
      {pendingDel && (
        <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #E5484D', borderRadius: 4, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>
            确认删除该图片？文件会从服务器一并移除，且不可恢复。
          </span>
          <button className="btn btn-sm" type="button" disabled={delBusy} onClick={confirmDelete} style={{ background: '#E5484D', borderColor: '#E5484D', color: '#fff' }}>
            {delBusy ? '删除中…' : '确认删除'}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPendingDel(''); setDelError(''); }}>取消</button>
        </div>
      )}
      {delError && (
        <div style={{ marginTop: 8, fontSize: 'var(--fs-small)', color: '#E5484D' }}>{delError}</div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? '上传中…' : '上传图片'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          style={{ display: 'none' }}
          onChange={e => onFiles(e.currentTarget.files)}
        />
        <span className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
          商品主图为在售商品引用（删除会影响前台展示），本地上传图片可删除<br />
          {imgRuleHint('media')}
        </span>
        {uploadError && <span style={{ fontSize: 'var(--fs-small)', color: '#E5484D' }}>{uploadError}</span>}
      </div>

      {/* 大图预览（点击遮罩或 Esc 关闭） */}
      {preview && (
        <div className="media-lightbox" onClick={() => setPreview(null)} role="dialog" aria-label="图片预览">
          <div className="media-lightbox-inner" onClick={e => e.stopPropagation()}>
            <div className="media-lightbox-head">
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
                <span className="badge plain">{SOURCE_LABELS[preview.source] || preview.source}</span>
                {preview.source !== 'catalog' && preview.size > 0 && (
                  <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{fmtSize(preview.size)}</span>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyUrl(preview.url)}>
                  {copied === preview.url ? '已复制' : '复制链接'}
                </button>
                <button type="button" onClick={() => setPreview(null)} title="关闭" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '64vh', display: 'block', margin: '12px auto 0', borderRadius: 3 }} />
          </div>
        </div>
      )}
    </div>
  );
}
