'use client';

import { useActionState } from 'react';
import { login } from '@/lib/actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <div className="login-card">
      <span className="brand">JERSEYDOCK admin</span>
      <h1>管理后台登录</h1>
      <p className="dim">独立站点 · 与前台商城分离（需求 N6）</p>

      <form action={formAction}>
        {state?.error && <p className="login-err">{state.error}</p>}
        <div className="field">
          <label htmlFor="email">邮箱</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="username" placeholder="owner@kitvault.local" />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input id="password" name="password" type="password" className="input" required autoComplete="current-password" placeholder="••••••••" />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? '登录中…' : '登录'}
        </button>
      </form>

      <p className="login-hint">
        演示账号：owner@kitvault.local / admin123<br />
        账号数据在 data/admin/admins.json；接入数据库后切换为 AdminUser 表。<br />
        会话密钥：环境变量 ADMIN_SESSION_SECRET（生产必须覆盖）。
      </p>
    </div>
  );
}
