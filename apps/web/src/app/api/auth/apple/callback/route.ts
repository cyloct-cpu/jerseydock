import { NextRequest, NextResponse } from 'next/server';
import { appleClientSecret, appleConfigured, decodeJwtPayload, finishOAuthLogin, verifyStateCookie } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

type AppleUserForm = { email?: string; name?: { firstName?: string; lastName?: string } };

/** POST /api/auth/apple/callback（Apple 以 form_post 回调）→ 换 token、找号/建号、落会话 */
export async function POST(req: NextRequest) {
  // 反代下 nextUrl.origin 是内网地址，对外跳转统一走 SITE_URL
  const origin = process.env.SITE_URL || req.nextUrl.origin;
  const loginErr = (msg: string) => NextResponse.redirect(new URL('/login?error=' + encodeURIComponent(msg), origin));
  if (!appleConfigured()) return loginErr('Apple sign-in is not configured');

  const form = await req.formData();
  const err = form.get('error');
  if (err) return loginErr(`Apple sign-in cancelled (${err})`);

  const state = await verifyStateCookie('apple', form.get('state') as string | null);
  if (!state) return loginErr('Sign-in session expired — please try again');
  const next = state.next;

  const code = form.get('code');
  if (typeof code !== 'string' || !code) return loginErr('Apple did not return an authorization code');

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: String(process.env.APPLE_SERVICES_ID),
      client_secret: appleClientSecret(),
      redirect_uri: `${origin}/api/auth/apple/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenRes.json().catch(() => null) as { id_token?: string; error_description?: string } | null;
  if (!tokenRes.ok || !token?.id_token) {
    return loginErr(`Apple token exchange failed: ${token?.error_description || tokenRes.status}`);
  }

  const claims = decodeJwtPayload(token.id_token);
  const email = String(claims.email || '');
  if (!email) return loginErr('Apple account has no shared email');

  // name 只在用户首次授权时由表单携带
  let name = '';
  const rawUser = form.get('user');
  if (typeof rawUser === 'string' && rawUser) {
    try {
      const u = JSON.parse(rawUser) as AppleUserForm;
      name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ');
    } catch { /* name 缺失可容忍 */ }
  }

  const target = await finishOAuthLogin(email, name, next);
  return NextResponse.redirect(new URL(target, origin));
}
