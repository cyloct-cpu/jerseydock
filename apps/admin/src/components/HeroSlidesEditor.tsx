'use client';

import { useRef, useState } from 'react';
import { validateImage, imgRuleHint } from '@/lib/image-rules';
import { LINK_OPTIONS, LINK_OPTION_GROUPS } from '@/lib/link-options';

export type HeroSlideValue = {
  id: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  cta2Text: string;
  cta2Href: string;
};

export type HeroValue = {
  enabled: boolean;
  intervalMs: number;
  slides: HeroSlideValue[];
};

type UploadFn = (fd: FormData) => Promise<{ ok: boolean; url?: string; error?: string }>;

const MAX_SLIDES = 5;

/** 上传走 /api/upload 路由（Server Action 有 1MB 请求体上限，大图会失败） */
const uploadHeroFile: UploadFn = async fd => {
  const res = await fetch('/api/upload?kind=hero', { method: 'POST', body: fd });
  return res.json();
};

/**
 * 链接字段：下拉选择站内页面（首页/全部商品/各合集类目）+ 手动输入框保留。
 * 输入框内容命中某个站内选项时，下拉同步显示该项；否则显示占位提示（自定义链接）。
 */
function LinkField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const known = LINK_OPTIONS.find(o => o.value === value.trim());
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          className="select"
          style={{ flex: 'none', width: 148 }}
          value={known ? known.value : ''}
          disabled={disabled}
          onChange={e => { if (e.currentTarget.value) onChange(e.currentTarget.value); }}
        >
          <option value="">{known ? '✓ 站内页面' : '选择站内页面…'}</option>
          {LINK_OPTION_GROUPS.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
        <input
          className="input"
          value={value}
          onChange={e => onChange(e.currentTarget.value)}
          placeholder="/collections/2026-27-season 或 https://…"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/**
 * Hero 轮播编辑器（后台「商店设置」）
 * 每张 slide：图片（URL 或本机上传）+ 小标签/标题/副文 + 双 CTA。
 * 以 heroJson 隐藏字段提交完整配置，前台 lib/brand.ts normalizeHero 读取。
 */
export function HeroSlidesEditor({ initial }: { initial: HeroValue }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [intervalSec, setIntervalSec] = useState(Math.round(initial.intervalMs / 1000));
  const [slides, setSlides] = useState<HeroSlideValue[]>(initial.slides);
  const [uploading, setUploading] = useState<string | null>(null); // 正在上传的 slide id
  const [uploadError, setUploadError] = useState('');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const update = (i: number, patch: Partial<HeroSlideValue>) => {
    setSlides(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const remove = (i: number) => setSlides(prev => prev.filter((_, idx) => idx !== i));
  const add = () => {
    if (slides.length >= MAX_SLIDES) return;
    setSlides(prev => [
      ...prev,
      {
        id: `hero_${Date.now().toString(36)}`,
        image: '',
        eyebrow: '',
        title: '',
        subtitle: '',
        ctaText: '',
        ctaHref: '/collections/2026-27-season',
        cta2Text: '',
        cta2Href: '',
      },
    ]);
  };
  const move = (i: number, dir: -1 | 1) => {
    setSlides(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const pickFile = (id: string) => fileRefs.current[id]?.click();

  const onFile = async (id: string, file: File | undefined) => {
    if (!file) return;
    setUploadError('');
    const invalid = await validateImage(file, 'hero');
    if (invalid) { setUploadError(invalid); return; }
    setUploading(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadHeroFile(fd);
      if (res.ok && res.url) update(slides.findIndex(s => s.id === id), { image: res.url });
      else setUploadError(res.error || '上传失败');
    } catch {
      setUploadError('上传失败，请重试');
    } finally {
      setUploading(null);
    }
  };

  const value: HeroValue = {
    enabled,
    intervalMs: Math.max(3, Math.min(15, Math.round(intervalSec || 7))) * 1000,
    slides: slides.slice(0, MAX_SLIDES).map(s => ({
      id: s.id,
      image: s.image.trim().slice(0, 500),
      eyebrow: s.eyebrow.trim().slice(0, 80),
      title: s.title.trim().slice(0, 120),
      subtitle: s.subtitle.trim().slice(0, 300),
      ctaText: s.ctaText.trim().slice(0, 40),
      ctaHref: s.ctaHref.trim().slice(0, 300),
      cta2Text: s.cta2Text.trim().slice(0, 40),
      cta2Href: s.cta2Href.trim().slice(0, 300),
    })).filter(s => s.image && s.title),
  };

  const dim = !enabled;

  return (
    <div style={{ display: 'grid', gap: 14, opacity: dim ? 0.55 : 1, transition: 'opacity .2s' }}>
      <input type="hidden" name="heroJson" value={JSON.stringify(value)} />

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: enabled ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.currentTarget.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
        启用 Hero 轮播（关闭后显示第一张静态图）
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 14, alignItems: 'end' }}>
        <div className="field">
          <label>切换间隔（秒，3–15）</label>
          <input className="input" type="number" min="3" max="15" value={intervalSec} onChange={e => setIntervalSec(Number(e.currentTarget.value))} disabled={dim} />
        </div>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)', paddingBottom: 10 }}>
          最多 {MAX_SLIDES} 张；图片为空或标题为空的 slide 会被忽略。悬停前台轮播会暂停自动切换。<br />
          {imgRuleHint('hero')}<br />
          主 / 次链接可下拉选择站内页面（首页、全部商品、各合集与类目），也可手动输入任意 URL。
        </span>
      </div>

      {slides.map((s, i) => (
        <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '12px 14px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">Slide #{i + 1}{i === 0 ? '（默认展示）' : ''}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={dim || i === 0}>上移</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, 1)} disabled={dim || i === slides.length - 1}>下移</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(i)} disabled={dim}>删除</button>
            </div>
          </div>

          {/* 图片：URL + 本机上传 */}
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center' }}>
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" style={{ width: 110, height: 74, objectFit: 'cover', border: '1px solid var(--line-2)', borderRadius: 2 }} />
            ) : (
              <div style={{ width: 110, height: 74, display: 'grid', placeItems: 'center', border: '1px dashed var(--line-2)', borderRadius: 2, color: 'var(--text-3)', fontSize: 10 }}>无图</div>
            )}
            <div className="field" style={{ marginBottom: 0 }}>
              <label>图片 URL（/assets/… 或外链）</label>
              <input className="input" value={s.image} onChange={e => update(i, { image: e.currentTarget.value })} placeholder="/assets/hero/hero-main.jpg" disabled={dim} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <button type="button" className="btn btn-sm" onClick={() => pickFile(s.id)} disabled={dim || uploading === s.id}>
                {uploading === s.id ? '上传中…' : '本机上传'}
              </button>
              <input
                ref={el => { fileRefs.current[s.id] = el; }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                style={{ display: 'none' }}
                onChange={e => { onFile(s.id, e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div className="field">
              <label>小标签（可选）</label>
              <input className="input" value={s.eyebrow} onChange={e => update(i, { eyebrow: e.currentTarget.value })} maxLength={80} placeholder="26 / 27 season — now live" disabled={dim} />
            </div>
            <div className="field">
              <label>主标题</label>
              <input className="input" value={s.title} onChange={e => update(i, { title: e.currentTarget.value })} maxLength={120} placeholder="Wear the game." disabled={dim} />
            </div>
          </div>

          <div className="field">
            <label>副文（可选）</label>
            <textarea className="input" rows={2} value={s.subtitle} onChange={e => update(i, { subtitle: e.currentTarget.value })} maxLength={300} disabled={dim} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 10 }}>
            <div className="field">
              <label>主按钮文字</label>
              <input className="input" value={s.ctaText} onChange={e => update(i, { ctaText: e.currentTarget.value })} maxLength={40} placeholder="Shop the new season" disabled={dim} />
            </div>
            <LinkField label="主按钮链接" value={s.ctaHref} onChange={v => update(i, { ctaHref: v })} disabled={dim} />
            <div className="field">
              <label>次链接文字（可选）</label>
              <input className="input" value={s.cta2Text} onChange={e => update(i, { cta2Text: e.currentTarget.value })} maxLength={40} placeholder="Browse retro" disabled={dim} />
            </div>
            <LinkField label="次链接地址" value={s.cta2Href} onChange={v => update(i, { cta2Href: v })} disabled={dim} />
          </div>
        </div>
      ))}

      <div>
        <button type="button" className="btn btn-ghost" onClick={add} disabled={dim || slides.length >= MAX_SLIDES}>+ 添加一张 slide</button>
        {uploadError && <span style={{ color: '#E5484D', fontSize: 'var(--fs-small)', marginLeft: 12 }}>{uploadError}</span>}
      </div>
    </div>
  );
}
