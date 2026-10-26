import { NextRequest, NextResponse } from 'next/server';
import { finishOAuthLogin, googleConfigured, verifyGoogleIdToken, verifyStateCookie } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/google/callback?code=…&state=… → 换 token、找号/建号、落会话 */
export async function GET(req: NextRequest) {
  const loginErr = (msg: string) => NextResponse.redirect(new URL('/login?error=' + encodeURIComponent(msg), req.url));
  if (!googleConfigured()) return loginErr('Google sign-in is not configured');

  const err = req.nextUrl.searchParams.get('error');
  if (err) return loginErr(`Google sign-in cancelled (${err})`);

  const state = await verifyStateCookie('google', req.nextUrl.searchParams.get('state'));
  if (!state) return loginErr('Sign-in session expired — please try again');
  const { next, nonce } = state;

  const code = req.nextUrl.searchParams.get('code');
  if (!code) return loginErr('Google did not return an authorization code');

  // 换 token；id_token 仍走 JWKS 严格验签 + nonce 比对（K-SEC-3，直连 TLS 不作为免验签理由）
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: String(process.env.GOOGLE_CLIENT_ID),
      client_secret: String(process.env.GOOGLE_CLIENT_SECRET),
      redirect_uri: `${req.nextUrl.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenRes.json().catch(() => null) as { id_token?: string; error_description?: string } | null;
  if (!tokenRes.ok || !token?.id_token) {
    return loginErr(`Google token exchange failed: ${token?.error_description || tokenRes.status}`);
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyGoogleIdToken(token.id_token, nonce);
  } catch (e) {
    return loginErr(`Google sign-in verification failed: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  const email = String(claims.email || '');
  if (!email) return loginErr('Google account has no email');

  const target = await finishOAuthLogin(email, String(claims.name || ''), next);
  return NextResponse.redirect(new URL(target, req.url));
}
