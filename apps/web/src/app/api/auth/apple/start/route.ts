import { NextRequest, NextResponse } from 'next/server';
import { appleConfigured, safeNext, writeStateCookie } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/apple/start → 跳转 Apple 授权页（需 HTTPS 域名 + Apple Developer 配置） */
export async function GET(req: NextRequest) {
  // 反代下 req.nextUrl.origin 是内网地址，对外跳转/回调统一走 SITE_URL
  const publicOrigin = process.env.SITE_URL || req.nextUrl.origin;
  if (!appleConfigured()) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Apple sign-in is not configured yet (needs APPLE_SERVICES_ID / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_KEY_CONTENT)'), publicOrigin));
  }
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const state = await writeStateCookie('apple', next);
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.searchParams.set('client_id', String(process.env.APPLE_SERVICES_ID));
  url.searchParams.set('redirect_uri', `${publicOrigin}/api/auth/apple/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'name email');
  // form_post：Apple 用 POST 回调，name 只在首次授权时随表单带来
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}
