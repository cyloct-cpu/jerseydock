import { NextRequest, NextResponse } from 'next/server';
import { googleConfigured, safeNext, writeStateCookie } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/google/start → 跳转 Google 授权页 */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Google sign-in is not configured yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)'), req.url));
  }
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const state = await writeStateCookie('google', next);
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', String(process.env.GOOGLE_CLIENT_ID));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return NextResponse.redirect(url);
}
