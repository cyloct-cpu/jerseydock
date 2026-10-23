import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ paddingBlock: '140px 200px', textAlign: 'center' }}>
      <span className="eyebrow">404</span>
      <h1 className="h2" style={{ margin: '12px 0 18px', fontSize: 'clamp(24px,3vw,36px)' }}>
        This page has left the pitch.
      </h1>
      <p className="muted" style={{ maxWidth: '46ch', margin: '0 auto 26px' }}>
        The page you were looking for doesn’t exist or has been moved. The shirt you want is probably still here.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn" href="/collections/2026-27-season">Shop the new season</Link>
        <Link className="btn btn-ghost" href="/">Back to the store</Link>
      </div>
    </div>
  );
}
