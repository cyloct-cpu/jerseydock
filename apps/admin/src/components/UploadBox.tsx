'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'folder' | 'zip' | 'loose';

const MODES: { id: Mode; icon: string; title: string; desc: string }[] = [
  { id: 'folder', icon: '📁', title: '图片文件夹', desc: '选整个文件夹或直接拖入，子目录名 = 清单「编号」列（推荐）' },
  { id: 'zip', icon: '📦', title: 'ZIP 包', desc: '含清单与各编号子目录，服务端自动解压' },
  { id: 'loose', icon: '🖼️', title: '散图', desc: '文件名 = 编号，无目录结构时的老方式' },
];

type Picked = { file: File; rel: string };

/**
 * 第 1 步上传区：清单必传 + 图片来源三选一
 * 使用 fetch POST 到 API Route（不走 Server Action，避免大文件 body 限制）
 * 上传成功后自动跳转到校验预览页
 */
export function UploadBox({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [folderName, setFolderName] = useState('');
  const [listName, setListName] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [zipName, setZipName] = useState('');
  const [looseCount, setLooseCount] = useState(0);
  const [mode, setMode] = useState<Mode>('folder');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const looseInputRef = useRef<HTMLInputElement>(null);

  const setFilesOnInput = (input: HTMLInputElement, files: FileList) => {
    const dt = new DataTransfer();
    for (const f of Array.from(files)) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const onListDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    if (listInputRef.current) setFilesOnInput(listInputRef.current, files);
  };

  /** 递归读取拖入的文件/文件夹（webkitGetAsEntry 必须在 await 之前同步取 entry） */
  const collectFromDataTransfer = async (dt: DataTransfer): Promise<Picked[]> => {
    const out: Picked[] = [];
    const walk = async (entry: any, prefix: string): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        const file: File = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ file, rel: prefix + entry.name });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = (): Promise<any[]> => new Promise((res, rej) => reader.readEntries(res, rej));
        let batch = await readBatch();
        while (batch.length) {
          for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
          batch = await readBatch();
        }
      }
    };
    const entries = Array.from(dt.items || [])
      .map(i => (typeof (i as any).webkitGetAsEntry === 'function' ? (i as any).webkitGetAsEntry() : null))
      .filter(Boolean);
    if (entries.length) {
      for (const e of entries) await walk(e, '');
      if (out.length) return out;
    }
    for (const f of Array.from(dt.files || [])) out.push({ file: f, rel: f.name });
    return out;
  };

  const submit = async () => {
    if (!listInputRef.current?.files?.length) { setError('请选择清单文件'); return; }
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.set('folder', folderName);
      const lf = listInputRef.current.files?.[0];
      if (lf) fd.set('listFile', lf, lf.name);
      // 文件夹通道：rel 路径放在 filename 里传给服务端（服务端 File 没有 webkitRelativePath）
      if (mode === 'folder') for (const p of picked) fd.append('files', p.file, p.rel);
      const zi = zipInputRef.current;
      if (mode === 'zip' && zi?.files?.[0]) fd.set('zipFile', zi.files[0], zi.files[0].name);
      const li = looseInputRef.current;
      if (mode === 'loose' && li?.files) for (const f of Array.from(li.files)) fd.append('images', f, f.name);

      const res = await fetch('/api/import/upload', { method: 'POST', body: fd });
      const text = await res.text();
      let j: { ok?: boolean; error?: string; folder?: string; warn?: string[] } | null = null;
      try { j = JSON.parse(text); } catch { /* 非 JSON（如 500 页面） */ }
      if (!res.ok || !j?.ok) { setError(`上传失败（HTTP ${res.status}）：${j?.error || text.slice(0, 200) || '服务无响应'}`); return; }
      router.push(`/products/import?folder=${encodeURIComponent(j.folder || '')}${j.warn?.length ? `&warn=${encodeURIComponent(j.warn.join('；'))}` : ''}`);
    } catch (e) { setError('上传请求失败：' + (e instanceof Error ? e.message : '网络异常，请重试')); } finally { setBusy(false); }
  };

  const card = (m: Mode) => {
    const on = mode === m;
    const def = MODES.find(x => x.id === m)!;
    return (
      <button key={m} type="button" onClick={() => setMode(m)}
        style={{ textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: 4,
          border: `1px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
          background: on ? 'var(--accent-dim, rgba(200,162,74,0.08))' : 'transparent', color: 'var(--text-2)' }}>
        <div style={{ fontSize: 18, marginBottom: 6 }}>{def.icon}</div>
        <div style={{ fontWeight: 500, color: on ? 'var(--accent)' : 'var(--text)' }}>{def.title}</div>
        <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4, lineHeight: 1.6 }}>{def.desc}</div>
      </button>
    );
  };

  return (
    <div>
      {/* 批次名称 + 清单文件 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>① 清单文件（products.csv / products.json / products.xlsx）</label>
          <input ref={listInputRef} className="input" type="file" accept=".csv,.json,.xlsx"
            onChange={e => setListName(e.target.files?.[0]?.name || '')} />
          {listName && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ok)' }}>已选：{listName}</span>}
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>批次名称（留空自动按日期命名）</label>
          <input className="input" value={folderName} onChange={e => setFolderName(e.currentTarget.value)} placeholder="2026-27-first" />
        </div>
      </div>

      {/* 图片来源：三选一（卡片 + 拖拽区域） */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <span className="eyebrow">② 图片来源（三选一）</span>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>子目录名 = 清单「编号」列，系统自动配对</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {MODES.map(m => card(m.id))}
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async e => {
            e.preventDefault(); setDragOver(false);
            if (!e.dataTransfer) return;
            if (mode === 'folder') {
              try { setPicked(await collectFromDataTransfer(e.dataTransfer)); } catch { /* 忽略拖拽解析失败 */ }
            } else if (mode === 'zip' && zipInputRef.current) {
              setFilesOnInput(zipInputRef.current, e.dataTransfer.files);
            } else if (mode === 'loose' && looseInputRef.current) {
              setFilesOnInput(looseInputRef.current, e.dataTransfer.files);
            }
          }}
          style={{
            marginTop: 12, padding: '12px 14px', border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--line-2)'}`,
            borderRadius: 4, background: dragOver ? 'var(--accent-dim, rgba(200,162,74,0.08))' : 'transparent',
            transition: 'border-color .2s, background .2s',
          }}
        >
          {mode === 'folder' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>选择整个图片文件夹（或直接拖入文件夹 / 多个文件）</label>
              <input className="input" type="file"
                // @ts-expect-error 非标准但受支持的属性
                webkitdirectory="" directory="" multiple
                onChange={e => {
                  const items: Picked[] = [];
                  for (const f of Array.from(e.target.files || [])) {
                    items.push({ file: f, rel: (f as any).webkitRelativePath || f.name });
                  }
                  setPicked(items);
                }} />
              {picked.length > 0 && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ok)', display: 'block', marginTop: 6 }}>已选 {picked.length} 个文件</span>}
            </div>
          )}
          {mode === 'zip' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>选择 ZIP 包</label>
              <input ref={zipInputRef} className="input" type="file" accept=".zip,application/zip" onChange={e => setZipName(e.target.files?.[0]?.name || '')} />
              {zipName && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ok)', display: 'block', marginTop: 6 }}>已选：{zipName}</span>}
            </div>
          )}
          {mode === 'loose' && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>选择散图（可多选）</label>
              <input ref={looseInputRef} className="input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => setLooseCount(e.target.files?.length || 0)} />
              {looseCount > 0 && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ok)', display: 'block', marginTop: 6 }}>已选 {looseCount} 张</span>}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn" type="button" disabled={busy || !listName} onClick={submit}>
          {busy ? '上传中…' : '上传并校验'}
        </button>
        <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>
          上传后进入第 2 步校验预览，确认无误才会入库
        </span>
      </div>

      {error && <div className="notice bad" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
