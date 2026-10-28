import { NextRequest, NextResponse } from 'next/server';
import { verifySessionEdge } from '@/lib/session';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * 后台独立鉴权（N6）：除 /login 外全部页面要求会话 Cookie。
 * 前后台会话不互通（前台无管理员登录入口）。
 */
export async function middleware(req: NextRequest) {
  // 登录页暴力破解防护：同 IP 每分钟最多 10 次请求（含失败重试）
  if (req.nextUrl.pathname === '/login' && req.method === 'POST') {
    const ip = clientIp(req.headers);
    if (!rateLimit(`${ip}#admin-login`, 10, 60_000)) {
      return new NextResponse('尝试过于频繁，请稍后再试', {
        status: 429,
        headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  // API 限流（上传 / 导出等重操作）
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip = clientIp(req.headers);
    if (!rateLimit(`${ip}#admin-api`, 60, 60_000)) {
      return new NextResponse('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
    }
  }

  // 已登录访问 /login 直接回工作台，避免「侧栏壳里套登录页」的诡异状态
  if (req.nextUrl.pathname === '/login') {
    const token = req.cookies.get('kv_admin_session')?.value;
    if (token && (await verifySessionEdge(token))) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }
  const token = req.cookies.get('kv_admin_session')?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|brand|login).*)'],
};
