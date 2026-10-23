'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { validateImage, imgRuleHint } from '@/lib/image-rules';

type UploadFn = (fd: FormData) => Promise<{ ok: boolean; urls?: string[]; error?: string }>;

export type LibraryItem = { url: string; name: string };

const MAX_IMAGES = 20;
const LIB_PAGE_SIZE = 60;

type LibListResp = {
  ok: boolean;
  items?: LibraryItem[];
  total?: number;
  error?: string;
};

/** 上传走 /api/upload 路由（Server Action 有 1MB 请求体上限，大图会失败） */
const uploadProductFiles: UploadFn = async fd => {
  const res = await fetch('/api/upload?kind=product', { method: 'POST', body: fd });
  return res.json();
};

/**
 * 商品图片编辑器（对齐主流电商后台形态）
 * - 缩略图网格，第一张带「主图」角标
 * - 拖拽排序：按住缩略图拖动，松手落位（半区判定插入前/后）；悬停显示 ‹ › 微调按钮
 * - 悬浮操作：设为主图 / 删除
 * - 追加：本机上传（多选，逐张即时上传，自动登记图库）或从图库选取（弹窗多选，走 /api/media/list 分页）
 * - 以隐藏字段（默认 imagesJson）提交 URL 数组
 */
export function ProductImagesEditor({
  initial,
  library = [],
  name = 'imagesJson',
}: {
  initial: string[];
  library?: LibraryItem[];
  name?: string;
}) {
  const [images, setImages] = useState<string[]>(initial.slice(0, MAX_IMAGES));
  // lib：本次会话新上传的图（弹窗即时可见）；弹窗列表主体走接口分页拉取
  const [lib, setLib] = useState<LibraryItem[]>(library);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [fetched, setFetched] = useState<LibraryItem[]>([]);
  const [libTotal, setLibTotal] = useState(0);
  const [libPage, setLibPage] = useState(1);
  const [libQInput, setLibQInput] = useState('');
  const [libQ, setLibQ] = useState('');
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ index: number; side: 'before' | 'after' } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 图库弹窗：搜索防抖 + 打开/翻页时拉取
  useEffect(() => {
    const t = setTimeout(() => setLibQ(libQInput.trim()), 300);
    return () => clearTimeout(t);
  }, [libQInput]);
  useEffect(() => { setLibPage(1); }, [libQ]);

  const loadLibrary = async (p: number, query: string) => {
    setLibLoading(true);
    setLibError('');
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(LIB_PAGE_SIZE) });
      if (query) params.set('q', query);
      const res = await fetch(`/api/media/list?${params.toString()}`);
      const data: LibListResp = await res.json();
      if (res.ok && data.ok && data.items) {
        setFetched(data.items);
        setLibTotal(data.total || 0);
      } else {
        setLibError(data.error || '图库加载失败');
      }
    } catch {
      setLibError('图库加载失败，请重试');
    } finally {
      setLibLoading(false);
    }
  };

  const openPicker = () => {
    setPicked([]);
    setLibQInput('');
    setLibQ('');
    setLibPage(1);
    setFetched([]);
    setPickerOpen(true);
  };

  // 弹窗打开期间：打开 / 搜索词 / 页码变化 → 拉取当前页
  useEffect(() => {
    if (!pickerOpen) return;
    void loadLibrary(libPage, libQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libPage, libQ, pickerOpen]);

  const setMain = (i: number) => {
    setImages(prev => {
      const next = [...prev];
      const [img] = next.splice(i, 1);
      next.unshift(img);
      return next;
    });
  };
  const remove = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));
  const add = (url: string) => {
    const u = url.trim();
    if (!u) return;
    setImages(prev => (prev.includes(u) ? prev : [...prev, u].slice(0, MAX_IMAGES)));
  };
  /** 把 from 移到 to 的位置（to 为目标下标） */
  const move = (from: number, to: number) => {
    setImages(prev => {
      if (from === to || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [img] = next.splice(from, 1);
      next.splice(to, 0, img);
      return next;
    });
  };

  // ---- 拖拽排序 ----
  const onDragStart = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    setDragFrom(i);
    setHoverIdx(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i)); // Firefox 需要 setData 才会发起拖拽
  };
  const onDragOver = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side: 'before' | 'after' = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
    setDropAt(prev => (prev && prev.index === i && prev.side === side ? prev : { index: i, side }));
  };
  const onDrop = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragFrom === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const side: 'before' | 'after' = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after';
    let to = side === 'before' ? i : i + 1;
    if (to > dragFrom) to -= 1; // 先移除再插入，下标左移
    move(dragFrom, to);
    setDragFrom(null);
    setDropAt(null);
  };
  const onDragEnd = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError('');
    // 上传前逐张校验（格式 / 大小 / 尺寸 / 比例），不合规的直接拦截并提示
    const valid: File[] = [];
    const invalid: string[] = [];
    for (const f of Array.from(files)) {
      const err = await validateImage(f, 'product');
      if (err) invalid.push(err);
      else valid.push(f);
    }
    if (!valid.length) { setError(invalid.join('；')); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      valid.forEach(f => fd.append('files', f));
      const res = await uploadProductFiles(fd);
      if (res.ok && res.urls?.length) {
        // 上传结果自动进入图库（本地同步一份，弹窗立即可见）
        setLib(prev => {
          const known = new Set(prev.map(x => x.url));
          return [...res.urls!.filter(u => !known.has(u)).map(u => ({ url: u, name: u.split('/').pop() || u })), ...prev];
        });
        setImages(prev => [...prev, ...res.urls!.filter(u => !prev.includes(u))].slice(0, MAX_IMAGES));
      } else setError(res.error || '上传失败');
      if (invalid.length) setError(prev => [prev, invalid.join('；')].filter(Boolean).join('；'));
    } catch {
      setError('上传失败，请重试');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmPick = () => {
    picked.forEach(add);
    setPicked([]);
    setPickerOpen(false);
  };

  // 弹窗列表 = 接口分页结果 + 本次会话新上传（新上传置顶去重）
  const seenLib = new Set(fetched.map(x => x.url));
  const libItems = [...lib.filter(x => !seenLib.has(x.url)), ...fetched];
  const pickable = libItems.filter(item => !images.includes(item.url));
  const libTotalPages = Math.max(1, Math.ceil(libTotal / LIB_PAGE_SIZE));

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(images)} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {images.map((img, i) => {
          const dragging = dragFrom === i;
          const indicator = dropAt && dropAt.index === i ? dropAt.side : null;
          return (
            <div
              key={img}
              className="pimg-tile"
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDrop={onDrop(i)}
              onDragEnd={onDragEnd}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(h => (h === i ? null : h))}
              title={img}
              style={{
                position: 'relative', width: 104, height: 130,
                border: '1px solid var(--line-2)', borderRadius: 3, overflow: 'hidden',
                background: 'var(--surface-2)',
                cursor: dragging ? 'grabbing' : 'grab',
                opacity: dragging ? 0.35 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              {i === 0 && (
                <span style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, background: 'var(--accent)', color: '#0A0A0B', fontSize: 10, padding: '2px 7px', borderRadius: '0 0 3px 0', fontWeight: 500 }}>
                  主图
                </span>
              )}

              {/* 悬停微调按钮（精确排序 / 触屏回退） */}
              {!dragging && hoverIdx === i && (
                <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 1, display: 'flex', gap: 2 }}>
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    title="前移一位"
                    style={{ width: 20, height: 20, border: 'none', borderRadius: 2, background: 'rgba(10,10,11,0.72)', color: i === 0 ? 'var(--text-3)' : '#F5F3EF', fontSize: 12, lineHeight: 1, cursor: i === 0 ? 'default' : 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
                  >‹</button>
                  <button
                    type="button"
                    disabled={i === images.length - 1}
                    onClick={() => move(i, i + 1)}
                    title="后移一位"
                    style={{ width: 20, height: 20, border: 'none', borderRadius: 2, background: 'rgba(10,10,11,0.72)', color: i === images.length - 1 ? 'var(--text-3)' : '#F5F3EF', fontSize: 12, lineHeight: 1, cursor: i === images.length - 1 ? 'default' : 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
                  >›</button>
                </span>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', inset: 'auto 0 0 0', display: 'flex', background: 'rgba(10,10,11,0.72)' }}>
                {i !== 0 && (
                  <button type="button" className="pimg-act" onClick={() => setMain(i)} title="设为主图">主图</button>
                )}
                <button type="button" className="pimg-act" onClick={() => remove(i)} title="删除" style={{ color: '#E5484D' }}>删除</button>
              </div>

              {/* 拖拽落位指示线 */}
              {indicator && (
                <span style={{
                  position: 'absolute', top: 0, bottom: 0, width: 2, zIndex: 2,
                  background: 'var(--accent)',
                  left: indicator === 'before' ? 0 : undefined,
                  right: indicator === 'after' ? 0 : undefined,
                }} />
              )}
            </div>
          );
        })}

        {/* 上传图片 tile */}
        <button
          type="button"
          className="pimg-tile"
          onClick={() => fileRef.current?.click()}
          disabled={busy || images.length >= MAX_IMAGES}
          style={{ width: 104, height: 130, border: '1px dashed var(--line-2)', borderRadius: 3, background: 'transparent', color: 'var(--text-3)', display: 'grid', placeItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12 }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
          <span>{busy ? '上传中…' : '上传图片'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          style={{ display: 'none' }}
          onChange={e => onFiles(e.currentTarget.files)}
        />

        {/* 从图库选取 tile */}
        <button
          type="button"
          className="pimg-tile"
          onClick={openPicker}
          disabled={images.length >= MAX_IMAGES}
          style={{ width: 104, height: 130, border: '1px dashed var(--line-2)', borderRadius: 3, background: 'transparent', color: 'var(--text-3)', display: 'grid', placeItems: 'center', gap: 4, cursor: images.length >= MAX_IMAGES ? 'default' : 'pointer', fontSize: 12 }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>▦</span>
          <span>从图库选取</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>
          共 {images.length}/{MAX_IMAGES} 张 · 按住缩略图拖动可调整顺序（第一张为主图，商品列表与详情页首图）· 上传的图片自动进入图库<br />
          {imgRuleHint('product')}
        </span>
        {error && <span style={{ fontSize: 'var(--fs-small)', color: '#E5484D' }}>{error}</span>}
      </div>

      {/* 图库选取弹窗 */}
      {pickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,11,0.6)', display: 'grid', placeItems: 'center', padding: 24 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}
        >
          <div style={{ width: 'min(860px, 94vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--surface, #141416)', border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}>
              <span style={{ fontWeight: 500 }}>从图库选取</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="search"
                  value={libQInput}
                  onChange={e => setLibQInput(e.currentTarget.value)}
                  placeholder="搜索图片名称…"
                  style={{ width: 200, padding: '5px 10px', border: '1px solid var(--line-2)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 'var(--fs-small)' }}
                />
                <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{libLoading ? '加载中…' : `共 ${libTotal} 张`}</span>
                <button type="button" onClick={() => setPickerOpen(false)} title="关闭" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
            </div>

            <div style={{ overflow: 'auto', padding: 18, flex: 1 }}>
              {pickable.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                  {pickable.map(item => {
                    const on = picked.includes(item.url);
                    return (
                      <button
                        key={item.url}
                        type="button"
                        title={item.name}
                        onClick={() => setPicked(prev => (on ? prev.filter(u => u !== item.url) : [...prev, item.url]))}
                        style={{
                          position: 'relative', height: 130, padding: 0, overflow: 'hidden',
                          border: on ? '2px solid var(--accent)' : '1px solid var(--line-2)',
                          borderRadius: 3, background: 'var(--surface-2)', cursor: 'pointer',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {on && (
                          <span style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 2, background: 'var(--accent)', color: '#0A0A0B', fontSize: 12, fontWeight: 600, display: 'grid', placeItems: 'center' }}>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="dim" style={{ padding: '60px 0', textAlign: 'center', fontSize: 'var(--fs-small)' }}>
                  {libLoading ? '图库加载中…' : libError || '没有匹配的图片 — 换个关键词，或先用「上传图片」上传。'}
                </div>
              )}
              {libError && pickable.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 'var(--fs-small)', color: '#E5484D' }}>{libError}</div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--line-2)' }}>
              {libTotalPages > 1 && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={libPage <= 1 || libLoading} onClick={() => setLibPage(p => p - 1)}>上一页</button>
                  <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>第 {libPage} / {libTotalPages} 页</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={libPage >= libTotalPages || libLoading} onClick={() => setLibPage(p => p + 1)}>下一页</button>
                </>
              )}
              <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>
                {picked.length ? `已选 ${picked.length} 张` : '点击图片选择，可多选'}
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}>取消</button>
              <button type="button" className="btn btn-sm" onClick={confirmPick} disabled={!picked.length || images.length + picked.length > MAX_IMAGES}>
                添加{picked.length ? ` ${picked.length} 张` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
