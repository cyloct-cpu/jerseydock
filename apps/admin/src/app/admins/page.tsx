import Link from 'next/link';
import { requirePage } from '@/lib/actions';
import {
  changePassword,
  createAdminUser,
  deleteAdminUser,
  listUsers,
  passwordHistory,
  resetAdminPassword,
  updateAdminUser,
} from '@/lib/actions';
import { PERMISSION_LABELS } from '@/lib/perm-client';
import { RolePermissionFields } from '@/components/RolePermissionFields';
import { PasswordInput } from '@/components/PasswordInput';

export const dynamic = 'force-dynamic';

function fmt(ts?: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; saved?: string; reset?: string; deleted?: string; edit?: string; passwordChanged?: string }>;
}) {
  const me = await requirePage('/admins');
  const sp = await searchParams;
  const users = listUsers();
  const history = passwordHistory(30);
  const editing = sp.edit ? users.find(u => u.id === sp.edit) : null;

  const nameOf = (id: string) => users.find(u => u.id === id)?.name || users.find(u => u.id === id)?.email || id;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">System</span>
          <h1 style={{ marginTop: 6 }}>账号管理</h1>
          <div className="sub">为团队成员开通后台账号并按模块授权。Owner 账号恒有全部权限。</div>
        </div>
        <Link className="btn btn-ghost" href="/settings">返回商店设置</Link>
      </div>

      {sp.error && <div className="notice bad">{sp.error}</div>}
      {sp.passwordChanged && <div className="notice ok">密码已更新，请牢记新密码。</div>}
      {sp.created && <div className="notice ok">账号已创建：{sp.created}。请把初始密码安全地告知本人，并提醒尽快修改。</div>}
      {sp.saved && <div className="notice ok">权限已更新，该账号下次操作即刻生效。</div>}
      {sp.reset && <div className="notice ok">密码已重置。账号 ID 与权限保持不变，对方可用新密码登录。</div>}
      {sp.deleted && <div className="notice ok">账号已删除。</div>}

      {/* ---------- 账号列表 ---------- */}
      <div className="a-card">
        <div className="a-card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <span className="eyebrow">账号列表（{users.length}）</span>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>无权限的菜单对该账号完全不可见</span>
        </div>
        <div className="a-table-wrap" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0 }}>
          <table className="a-table">
            <thead>
              <tr>
                <th>邮箱</th><th style={{ width: 90 }}>姓名</th><th style={{ width: 90 }}>角色</th>
                <th>已开通权限</th><th style={{ minWidth: 150 }}>最后登录</th><th style={{ minWidth: 190 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isOwner = u.role === 'owner';
                const perms = isOwner ? [] : (u.permissions || []);
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.email}{u.id === me?.id && <span className="badge ok" style={{ marginLeft: 8 }}>当前</span>}</td>
                    <td>{u.name}</td>
                    <td>
                      <span className={`badge ${isOwner ? 'ok' : 'plain'}`}>
                        {isOwner ? 'Owner' : (u.roleName || '运营')}
                      </span>
                    </td>
                    <td>
                      {isOwner ? (
                        <span className="dim">全部权限</span>
                      ) : perms.length ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {perms.slice(0, 5).map(p => (
                            <span className="badge plain" key={p}>{PERMISSION_LABELS[p] || p}</span>
                          ))}
                          {perms.length > 5 && <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>+{perms.length - 5}</span>}
                        </div>
                      ) : (
                        <span className="dim">未开通任何权限</span>
                      )}
                    </td>
                    <td className="dim">{fmt(u.lastLoginAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link className="btn btn-sm btn-ghost" href={`/admins?edit=${encodeURIComponent(u.id)}`}>编辑权限</Link>
                        {!isOwner && u.id !== me?.id && (
                          <form action={deleteAdminUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="btn btn-sm btn-danger" type="submit">删除</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16, alignItems: 'start' }}>
        {/* ---------- 新建 / 编辑 ---------- */}
        <div className="a-card a-card-pad">
          <span className="eyebrow">{editing ? `编辑账号 · ${editing.email}` : '新建账号'}</span>
          <form action={editing ? updateAdminUser : createAdminUser} style={{ marginTop: 14, display: 'grid', gap: 14 }}>
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>邮箱（登录账号）</label>
                <input
                  className="input"
                  name="email"
                  defaultValue={editing?.email || ''}
                  disabled={Boolean(editing)}
                  required={!editing}
                  placeholder="staff@kitvault.local"
                />
              </div>
              <div className="field">
                <label>姓名</label>
                <input className="input" name="name" defaultValue={editing?.name || ''} placeholder="小王" />
              </div>
              {!editing && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <PasswordInput
                    name="password"
                    label="初始密码（至少 8 位）"
                    placeholder="点「显示」后可复制给本人"
                    required
                  />
                </div>
              )}
            </div>

            <RolePermissionFields
              defaultIsOwner={editing?.role === 'owner'}
              defaultRoleName={editing && editing.role !== 'owner' ? (editing.roleName || '') : ''}
              defaultPermissions={editing?.permissions || []}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" type="submit">{editing ? '保存权限' : '创建账号'}</button>
              {editing && <Link className="btn btn-ghost" href="/admins">取消编辑</Link>}
            </div>
          </form>
        </div>

        {/* ---------- 重置密码 + 审计 ---------- */}
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="a-card a-card-pad">
            <span className="eyebrow">重置密码</span>
            <p className="dim" style={{ marginTop: 8, fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
              密码为单向哈希存储，<b>无法查看原文</b>。忘记密码时在此设置新密码即可，
              账号的角色与权限、历史记录全部保留，无需删除重建。
            </p>
            <form action={resetAdminPassword} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div className="field">
                <label>选择账号</label>
                <select className="select" name="id" required defaultValue="">
                  <option value="" disabled>请选择</option>
                  {users.filter(u => u.id !== me?.id).map(u => (
                    <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
                  ))}
                </select>
              </div>
              <PasswordInput
                name="password"
                label="新密码（至少 8 位）"
                placeholder="点「显示」后可复制并告知本人"
                required
              />
              <button className="btn" type="submit" disabled={!users.some(u => u.id !== me?.id)}>重置密码</button>
            </form>
          </div>

          <div className="a-card a-card-pad">
            <span className="eyebrow">修改我的密码</span>
            <form action={changePassword} style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div className="field">
                <label>原密码</label>
                <input className="input" name="oldPassword" type="password" required autoComplete="current-password" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <PasswordInput name="newPassword" label="新密码（至少 8 位）" required />
                <div className="field">
                  <label>确认新密码</label>
                  <input className="input" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
                </div>
              </div>
              <button className="btn" type="submit">更新密码</button>
              <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
                修改记录会同步到下方「密码变更记录」，Owner 可查看是谁在何时修改的。
              </p>
            </form>
          </div>

          <div className="a-card a-card-pad">
            <span className="eyebrow">密码变更记录</span>
            {history.length ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {history.map((h, i) => (
                  <div key={i} className="mini-row" style={{ fontSize: 'var(--fs-micro)' }}>
                    <span>
                      {h.action === 'password:reset'
                        ? <><b>{nameOf(h.by)}</b> 重置了 <b>{nameOf(h.target)}</b> 的密码</>
                        : <><b>{nameOf(h.by)}</b> 修改了自己的密码</>}
                    </span>
                    <span className="dim">{fmt(h.ts)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dim" style={{ marginTop: 12, fontSize: 'var(--fs-micro)' }}>还没有密码变更记录。</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
