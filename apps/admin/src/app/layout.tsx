import type { Metadata } from 'next';
import './globals.css';
import { AdminNav } from '@/components/AdminNav';
import { currentUser, logout } from '@/lib/actions';

export const metadata: Metadata = {
  title: { default: 'Admin · JERSEYDOCK', template: '%s · Admin' },
  robots: { index: false, follow: false }, // 后台禁止收录
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const isProd = process.env.NODE_ENV === 'production';
  return (
    // translate="no"：告知翻译类浏览器扩展（沉浸式翻译 / Google Translate 等）跳过本页，
    // 避免其在水合前注入 <font>/属性导致 React Hydration 失败；
    // suppressHydrationWarning：兜底容忍扩展对 html/body 的属性注入。
    <html lang="en" translate="no" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {user ? (
          <div className="a-shell">
            <aside className="a-side">
              <span className="brand"><img src="/brand/logo-icon.png?v=2" alt="" width={36} height={36} />JERSEYDOCK admin</span>
              <AdminNav permissions={user.permissions} />
              <div className="foot">
                独立后台{isProd ? '' : ' · 端口 3001'}<br />
                与前台会话不互通
              </div>
            </aside>
            <div className="a-main">
              <div className="a-top">
                <span className="env">{isProd ? 'PROD · 文件存储' : 'DEV · 文件存储'}</span>
                <span className="spacer" />
                <span className="who">
                  <b>{user.name || user.email}</b> · {user.role === 'owner' ? 'Owner' : user.roleName}
                </span>
                <form action={logout}>
                  <button className="btn btn-ghost btn-sm" type="submit">退出登录</button>
                </form>
              </div>
              <div className="a-body">{children}</div>
            </div>
          </div>
        ) : (
          <div className="login-wrap">{children}</div>
        )}
      </body>
    </html>
  );
}
