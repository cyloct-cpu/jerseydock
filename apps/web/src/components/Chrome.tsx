'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { BrandLogo } from './BrandLogo';
import { CurrencySelect, LocaleSelect } from './Controls';
import { translate } from '@/lib/i18n';
import { HeaderSearch } from './HeaderSearch';
import type { AnnouncementBar } from '@/lib/brand';

const NAV = [
  { href: '/collections/2026-27-season', key: 'nav.new' },
  { href: '/nations', key: 'nav.nations' },
  { href: '/clubs', key: 'nav.clubs' },
  { href: '/collections/retro', key: 'nav.retro' },
  { href: '/collections/kids-size', key: 'nav.kids' },
  { href: '/collections/autumn-and-winter-series', key: 'nav.outerwear' },
];

export function Announcement({ bar }: { bar?: AnnouncementBar }) {
  const { locale } = useStore();
  const t = (k: string) => translate(locale, k);
  const cfg = bar ?? { enabled: true, items: [] as string[], color: '', bg: '', fontSize: 12 };
  if (!cfg.enabled) return null;

  // 后台自定义文案优先；留空则回落到 i18n 默认三条
  const items = cfg.items.length
    ? cfg.items
    : [t('bar.shipping'), t('bar.delivery'), t('bar.returns')];

  const style = {
    ...(cfg.bg ? { background: cfg.bg } : {}),
    ...(cfg.color ? { color: cfg.color } : {}),
    ['--bar-fs' as string]: `${cfg.fontSize || 12}px`,
  };

  return (
    <div className="announce" style={style}>
      <div className="announce-track" role="marquee" aria-label={items.join(' · ')}>
        {/* 两份内容实现无缝循环（第二份 aria-hidden 避免读屏重复） */}
        {[0, 1].map(copy => (
          <div className="announce-group" key={copy} aria-hidden={copy === 1}>
            {items.map((text, i) => (
              <span key={i} className={i === 0 ? 'lead' : undefined}>{text}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Header({ brandName, user }: { brandName?: string; user?: { name: string; email: string } | null }) {
  const { locale, cartCount } = useStore();
  const t = (k: string) => translate(locale, k);
  return (
    <header className="header">
      <div className="container">
        <Link href="/" aria-label="Home"><BrandLogo name={brandName} /></Link>
        <nav className="nav">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}>{t(n.key)}</Link>
          ))}
        </nav>
        <HeaderSearch />
        <div className="tools">
          <LocaleSelect />
          <CurrencySelect />
          {/* 登录态：显示账户入口；未登录：登录入口 */}
          <Link className="cart-link" href={user ? '/account' : '/login'} title={user ? user.email : undefined}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {user ? (user.name || t('nav.account')) : t('nav.signin')}
          </Link>
          <Link className="cart-link" href="/cart">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {t('cart.title')} <b>{cartCount}</b>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer({ brandName, supportEmail }: { brandName?: string; supportEmail?: string }) {
  const { locale } = useStore();
  const t = (k: string) => translate(locale, k);
  return (
    <footer className="footer">
      <div className="container">
        <div className="trust">
          <div><b>{t('bar.shipping')}</b>{t('bar.promo_detail')}</div>
          <div><b>{t('bar.delivery')}</b>{t('bar.tracked')}</div>
          <div><b>{t('bar.returns')}</b>{t('bar.refund_note')}</div>
          <div><b>{t('bar.secure')}</b>{t('bar.encrypted')}</div>
        </div>
        <div className="footer-cols">
          <div>
            <BrandLogo name={brandName} />
            <p className="dim" style={{ marginTop: 12, maxWidth: '34ch' }}>
              Club and national team jerseys — fan, player and kids versions.
              Worldwide delivery, 30-day returns.
            </p>
            {supportEmail && (
              <p className="dim" style={{ marginTop: 8 }}>
                <a href={`mailto:${supportEmail}`} style={{ borderBottom: '1px solid var(--line-2)' }}>{supportEmail}</a>
              </p>
            )}
          </div>
          <div>
            <h4>{t('footer.shop')}</h4>
            <ul>
              <li><Link href="/collections/2026-27-season">26 / 27 season</Link></li>
              <li><Link href="/collections/retro">Retro</Link></li>
              <li><Link href="/nations">National teams</Link></li>
              <li><Link href="/clubs">Clubs</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t('footer.help')}</h4>
            <ul>
              <li><Link href="/pages/shipping">{t('footer.shipping')}</Link></li>
              <li><Link href="/pages/returns">{t('footer.returns')}</Link></li>
              <li><Link href="/pages/size-guide">{t('footer.size')}</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t('footer.about')}</h4>
            <ul>
              <li><Link href="/pages/about">About</Link></li>
              <li><Link href="/pages/faq">{t('footer.faq')}</Link></li>
              <li><Link href="/pages/contact">{t('footer.contact')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom" style={{ marginTop: 34 }}>
          <span>© {new Date().getFullYear()} {brandName || 'JERSEYDOCK'}. {t('footer.rights')}</span>
          {/* <!-- PAYMENT SLOTS --> TODO: 支付渠道开通后替换为真实图标 */}
          <span className="pay-slots"><i>VISA</i><i>MC</i><i>PAYPAL</i></span>
        </div>
      </div>
    </footer>
  );
}
