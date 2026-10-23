'use client';

import { useState } from 'react';

export type CustomizeOption = { label: string; price: number; image: string };

export type CustomizeValue = {
  enabled: boolean;
  nameNumber: { enabled: boolean; price: number; maxLength: number; placeholder: string };
  armband: { enabled: boolean; options: CustomizeOption[] };
};

const DEFAULT_ARM_IMAGE = '/assets/customize/armband.jpg';

/**
 * 商品定制编辑器（后台「商店设置」）
 * 对应前台商品详情页：姓名 + 号码烫印 / 袖章补丁选择。
 * 以 customizeJson 隐藏字段提交完整配置，前台 lib/brand.ts normalizeCustomize 读取。
 */
export function CustomizeEditor({ initial }: { initial: CustomizeValue }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [nameEnabled, setNameEnabled] = useState(initial.nameNumber.enabled);
  const [namePrice, setNamePrice] = useState(initial.nameNumber.price);
  const [nameMax, setNameMax] = useState(initial.nameNumber.maxLength);
  const [namePlaceholder, setNamePlaceholder] = useState(initial.nameNumber.placeholder);
  const [armEnabled, setArmEnabled] = useState(initial.armband.enabled);
  const [options, setOptions] = useState<CustomizeOption[]>(
    initial.armband.options.length ? initial.armband.options : [],
  );

  const update = (i: number, patch: Partial<CustomizeOption>) => {
    setOptions(prev => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  };
  const remove = (i: number) => setOptions(prev => prev.filter((_, idx) => idx !== i));
  const add = () => {
    setOptions(prev => [
      ...prev,
      { label: '', price: 3, image: '' },
    ]);
  };
  const move = (i: number, dir: -1 | 1) => {
    setOptions(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const value: CustomizeValue = {
    enabled,
    nameNumber: {
      enabled: nameEnabled,
      price: Math.max(0, Math.min(999, Math.round(namePrice || 0))),
      maxLength: Math.max(1, Math.min(100, Math.round(nameMax || 24))),
      placeholder: namePlaceholder.trim() || 'Ronaldo#7',
    },
    armband: {
      enabled: armEnabled,
      options: options
        .map(o => ({
          label: o.label.trim().slice(0, 40),
          price: Math.max(0, Math.min(999, Math.round(Number(o.price) || 0))),
          image: o.image.trim() || DEFAULT_ARM_IMAGE,
        }))
        .filter(o => o.label)
        .slice(0, 8),
    },
  };

  const dim = !enabled;

  return (
    <div style={{ display: 'grid', gap: 14, opacity: dim ? 0.55 : 1, transition: 'opacity .2s' }}>
      <input type="hidden" name="customizeJson" value={JSON.stringify(value)} />

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: enabled ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.currentTarget.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
        在商品详情页展示定制区（姓名烫印 / 袖章补丁）
      </label>

      {/* 姓名 + 号码烫印 */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '12px 14px', display: 'grid', gap: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={nameEnabled} onChange={e => setNameEnabled(e.currentTarget.checked)} disabled={dim} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
          启用「姓名 + 号码」烫印输入框
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr', gap: 10 }}>
          <div className="field">
            <label>加价（USD）</label>
            <input className="input" type="number" min="0" max="999" value={namePrice} onChange={e => setNamePrice(Number(e.currentTarget.value))} disabled={dim} />
          </div>
          <div className="field">
            <label>最多字符</label>
            <input className="input" type="number" min="1" max="100" value={nameMax} onChange={e => setNameMax(Number(e.currentTarget.value))} disabled={dim} />
          </div>
          <div className="field">
            <label>输入框提示文案</label>
            <input className="input" value={namePlaceholder} onChange={e => setNamePlaceholder(e.currentTarget.value)} maxLength={40} disabled={dim} placeholder="Ronaldo#7" />
          </div>
        </div>
        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>填写后才加价；留空不加价。字符数超限时前台会提示。</span>
      </div>

      {/* 袖章补丁 */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '12px 14px', display: 'grid', gap: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={armEnabled} onChange={e => setArmEnabled(e.currentTarget.checked)} disabled={dim} style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }} />
          启用「袖章补丁」选择（单选，选中即加价）
        </label>

        {options.map((o, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr auto', gap: 10, alignItems: 'end' }}>
            <div className="field">
              <label>名称 #{i + 1}</label>
              <input className="input" value={o.label} onChange={e => update(i, { label: e.currentTarget.value })} maxLength={40} disabled={dim} placeholder="World Cup badge" />
            </div>
            <div className="field">
              <label>加价</label>
              <input className="input" type="number" min="0" max="999" value={o.price} onChange={e => update(i, { price: Number(e.currentTarget.value) })} disabled={dim} />
            </div>
            <div className="field">
              <label>图片 URL（留空用默认图）</label>
              <input className="input" value={o.image} onChange={e => update(i, { image: e.currentTarget.value })} disabled={dim} placeholder={DEFAULT_ARM_IMAGE} />
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={dim || i === 0} aria-label="上移">↑</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(i, 1)} disabled={dim || i === options.length - 1} aria-label="下移">↓</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(i)} disabled={dim}>删除</button>
            </div>
          </div>
        ))}

        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={dim || options.length >= 8}>+ 添加一个补丁</button>
          <span className="dim" style={{ marginLeft: 12, fontSize: 'var(--fs-micro)' }}>共 {options.length} 个（前台最多展示 8 个，名称为空的项会被忽略）</span>
        </div>
      </div>

      <div className="notice" style={{ marginBottom: 0, fontSize: 'var(--fs-micro)', lineHeight: 1.8 }}>
        <b>前台效果</b>：详情页尺码 / 数量下方出现烫印输入框与补丁选择，加价实时计入「加入购物车」按钮金额，并随订单一起提交。
      </div>
    </div>
  );
}
