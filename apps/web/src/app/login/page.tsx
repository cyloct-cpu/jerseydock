import Link from 'next/link';
import { loginAction } from '@/lib/auth-actions';
import { AuthProviderButtons } from '@/components/AuthProviderButtons';
import { appleConfigured } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; registered?: string }>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') ? sp.next : '/account';

  return (
    <div className="container auth-wrap">
      <div className="panel panel-pad auth-card">
        <span className="eyebrow">Welcome back</span>
        <h1 className="h2" style={{ margin: '10px 0 20px', fontSize: 'clamp(24px,3vw,34px)' }}>Sign in</h1>

        {sp.error && <div className="auth-error" role="alert">{sp.error}</div>}
        {sp.registered && <div className="auth-ok">Account created — you are signed in.</div>}

        <AuthProviderButtons next={next} appleEnabled={appleConfigured()} />

        <form action={loginAction} style={{ display: 'grid', gap: 14 }}>
          <input type="hidden" name="next" value={next} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="password">Password</label>
            <input id="password" className="input" type="password" name="password" required autoComplete="current-password" placeholder="••••••••" />
          </div>
          <button className="btn btn-block" type="submit">Sign in</button>
        </form>

        <p className="dim" style={{ marginTop: 18 }}>
          New here?{' '}
          <Link className="auth-link" href={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
        </p>
        <p className="dim" style={{ marginTop: 8 }}>
          Just want to check an order?{' '}
        </p>
      </div>
    </div>
  );
}
