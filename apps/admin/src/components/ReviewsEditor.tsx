'use client';

import { useState } from 'react';

type Review = {
  id: string;
  name: string;
  location: string;
  rating: number;
  content: string;
  date: string;
  avatar: string;
};

/**
 * 客户评价编辑器（后台）
 * 动态增删改，提交为 JSON 字符串（reviewsJson 字段）。
 * 说明：内容为运营自定义，非真实用户评价，前台会明确标注。
 */
export function ReviewsEditor({
  initial,
  initialEnabled = true,
  initialTitle = 'What our customers say',
  initialSubtitle = '',
}: {
  initial: Review[];
  initialEnabled?: boolean;
  initialTitle?: string;
  initialSubtitle?: string;
}) {
  const [list, setList] = useState<Review[]>(initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);

  const update = (i: number, patch: Partial<Review>) => {
    setList(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => setList(prev => prev.filter((_, idx) => idx !== i));

  const add = () => {
    setList(prev => [
      ...prev,
      {
        id: `rv_new_${Date.now()}_${prev.length}`,
        name: '',
        location: '',
        rating: 5,
        content: '',
        date: new Date().toISOString().slice(0, 10),
        avatar: '',
      },
    ]);
  };

  const move = (i: number, dir: -1 | 1) => {
    setList(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <input type="hidden" name="reviewsEnabled" value={enabled ? 'on' : 'off'} />
      <input type="hidden" name="reviewsJson" value={JSON.stringify(list)} />
      <input type="hidden" name="reviewsTitle" value={title} />
      <input type="hidden" name="reviewsSubtitle" value={subtitle} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          style={{
            width: 42, height: 23, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
            background: enabled ? 'var(--accent)' : 'var(--line-2)', transition: 'background .15s', flex: 'none', padding: 0,
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: enabled ? 21 : 2, width: 19, height: 19, borderRadius: '50%', background: '#0A0A0B', transition: 'left .15s' }} />
        </button>
        <span style={{ fontSize: 'var(--fs-small)', color: enabled ? 'var(--accent)' : 'var(--text-2)' }}>
          {enabled ? '已开启' : '已关闭'} — 在前台首页展示评价区
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>区块标题</label>
          <input className="input" value={title} onChange={e => setTitle(e.currentTarget.value)} maxLength={60} />
        </div>
        <div className="field">
          <label>副标题（可选）</label>
          <input className="input" value={subtitle} onChange={e => setSubtitle(e.currentTarget.value)} maxLength={120} />
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 0, fontSize: 'var(--fs-micro)' }}>
        这些评价由运营在后台自行撰写，<b>不代表真实用户反馈</b>，前台不会伪装为买家留评。
      </div>

      {list.map((r, i) => (
        <div key={r.id || i} style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '12px 14px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">评价 #{i + 1}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={i === 0}>上移</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1}>下移</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(i)}>删除</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 10 }}>
            <div className="field">
              <label>客户名</label>
              <input className="input" value={r.name} onChange={e => update(i, { name: e.currentTarget.value })} maxLength={40} placeholder="James W." />
            </div>
            <div className="field">
              <label>地区</label>
              <input className="input" value={r.location} onChange={e => update(i, { location: e.currentTarget.value })} maxLength={40} placeholder="Manchester, UK" />
            </div>
            <div className="field">
              <label>评分</label>
              <select className="select" value={r.rating} onChange={e => update(i, { rating: Number(e.currentTarget.value) })}>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} 星</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>评价内容（留空则该条不展示）</label>
            <textarea className="input" rows={3} value={r.content} onChange={e => update(i, { content: e.currentTarget.value })} maxLength={600} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
            <div className="field">
              <label>日期</label>
              <input className="input" type="date" value={r.date} onChange={e => update(i, { date: e.currentTarget.value })} />
            </div>
            <div className="field">
              <label>头像 URL（可选，留空用姓名首字母）</label>
              <input className="input" value={r.avatar} onChange={e => update(i, { avatar: e.currentTarget.value })} placeholder="https://…" />
            </div>
          </div>
        </div>
      ))}

      <div>
        <button type="button" className="btn btn-ghost" onClick={add}>+ 添加一条评价</button>
        <span className="dim" style={{ marginLeft: 12, fontSize: 'var(--fs-micro)' }}>共 {list.length} 条（前台最多保留 24 条有效评价）</span>
      </div>
    </div>
  );
}
