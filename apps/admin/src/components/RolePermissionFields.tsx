'use client';

import { useState } from 'react';
import { PERMISSION_GROUPS, PERMISSION_PRESETS, type PermissionPreset } from '@/lib/perm-client';

/**
 * 角色 + 权限 配置区（客户端）
 *  · RoleField：Owner 开关 + 自定义角色名
 *  · PermissionPicker：Owner 开启时自动禁用权限勾选
 * 两者的联动必须共享状态，因此合并为一个组件。
 */
export function RolePermissionFields({
  defaultIsOwner = false,
  defaultRoleName = '',
  defaultPermissions = [],
}: {
  defaultIsOwner?: boolean;
  defaultRoleName?: string;
  defaultPermissions?: string[];
}) {
  const [isOwner, setIsOwner] = useState(defaultIsOwner);
  const [roleName, setRoleName] = useState(defaultRoleName);
  const [picked, setPicked] = useState<Set<string>>(new Set(defaultPermissions));

  const toggle = (key: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (items: { key: string }[]) => {
    setPicked(prev => {
      const next = new Set(prev);
      const allOn = items.every(i => next.has(i.key));
      for (const i of items) {
        if (allOn) next.delete(i.key);
        else next.add(i.key);
      }
      return next;
    });
  };

  const activePreset = isOwner
    ? null
    : PERMISSION_PRESETS.find(p => {
        const s = new Set(p.permissions);
        return s.size === picked.size && [...picked].every(k => s.has(k));
      });

  const total = PERMISSION_GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ---------- 角色 ---------- */}
      <div className="field">
        <label>角色</label>
        <label
          style={{
            display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-small)',
            color: isOwner ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', marginBottom: 10,
          }}
        >
          <input
            type="checkbox"
            name="isOwner"
            checked={isOwner}
            onChange={e => setIsOwner(e.currentTarget.checked)}
            style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
          />
          <span>设为 Owner（拥有全部权限，不可被降权）</span>
        </label>

        <input type="hidden" name="role" value={isOwner ? 'owner' : 'operator'} />

        {isOwner ? (
          <div className="notice" style={{ marginBottom: 0, fontSize: 'var(--fs-micro)' }}>
            该账号将拥有全部权限（含账号管理），角色固定显示为 Owner。下方权限区已停用。
          </div>
        ) : (
          <>
            <input
              className="input"
              name="roleName"
              value={roleName}
              onChange={e => setRoleName(e.currentTarget.value)}
              placeholder="运营主管"
              maxLength={24}
            />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>
              自定义角色名仅用于标识，不影响权限。留空默认「运营」。建议：运营主管 / 客服专员 / 物流专员
            </span>
          </>
        )}
      </div>

      {/* ---------- 权限 ---------- */}
      <div className="field">
        <label>权限开通</label>

        {isOwner ? (
          <div className="notice" style={{ marginBottom: 0 }}>
            Owner 账号恒拥有全部权限（{total} 项），不可单独调整。
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* 预设 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>快捷预设</span>
              {PERMISSION_PRESETS.map(p => {
                const on = activePreset?.key === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`btn btn-sm${on ? '' : ' btn-ghost'}`}
                    onClick={() => setPicked(new Set(p.permissions))}
                    title={p.hint}
                    aria-pressed={on}
                    style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                  >
                    {p.label}
                    {on && <span style={{ marginLeft: 6, fontSize: 9 }}>✓</span>}
                  </button>
                );
              })}
            </div>

            {/* 分组 */}
            {PERMISSION_GROUPS.map(g => {
              const keys = g.items.map(i => i.key);
              const onCount = keys.filter(k => picked.has(k)).length;
              const allOn = onCount === keys.length;
              const someOn = onCount > 0 && !allOn;
              return (
                <div key={g.group} style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={el => { if (el) el.indeterminate = someOn; }}
                        onChange={() => toggleGroup(g.items)}
                        style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                        aria-label={`全选 ${g.group} 组`}
                      />
                      <span className="eyebrow">{g.group}</span>
                      <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{onCount}/{keys.length}</span>
                    </label>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggleGroup(g.items)}>
                      {allOn ? '取消本组' : '全选本组'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                    {g.items.map(i => (
                      <label
                        key={i.key}
                        style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                          fontSize: 'var(--fs-small)',
                          color: picked.has(i.key) ? 'var(--text)' : 'var(--text-3)',
                          cursor: 'pointer',
                          transition: 'color 160ms var(--ease)',
                        }}
                        title={i.hint}
                      >
                        <input
                          type="checkbox"
                          name="permissions"
                          value={i.key}
                          checked={picked.has(i.key)}
                          onChange={() => toggle(i.key)}
                          style={{ accentColor: 'var(--accent)', width: 15, height: 15, marginTop: 2, cursor: 'pointer', flex: '0 0 auto' }}
                        />
                        <span>
                          {i.label}
                          {i.hint && <span className="dim" style={{ display: 'block', fontSize: 'var(--fs-micro)' }}>{i.hint}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="dim" style={{ fontSize: 'var(--fs-micro)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span>已选 <b style={{ color: 'var(--accent)' }}>{picked.size}</b> / {total} 项 · 账号管理权限仅 Owner 拥有，不可授予</span>
              <span>当前预设：{activePreset ? activePreset.label : '自定义组合'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
