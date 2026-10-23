import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { getSessionUserFull } from '@/lib/users';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';
import { updateProfileAction } from '@/lib/auth-actions';
import { PhoneInput } from '@/components/PhoneInput';
import { T } from '@/components/ContentT9n';

export const dynamic = 'force-dynamic';

const ORDERS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'orders.jsonl');

function countOrders(email: string): number {
  try {
    return fs.readFileSync(ORDERS_LOG, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l) as { email: string }; } catch { return null; } })
      .filter(o => o && o.email.toLowerCase() === email.toLowerCase()).length;
  } catch {
    return 0;
  }
}

export default async function AccountOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getSessionUserFull();
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  if (!user) return null; // layout 已做登录守卫，双保险
  const sp = await searchParams;
  const orderCount = countOrders(user.email);
  const memberSince = new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const addr = user.address;

  return (
    <>
      <div className="page-head" style={{ padding: 0, marginBottom: 20 }}>
        <div>
          <span className="eyebrow">Account</span>
          <h1 style={{ marginTop: 6, fontSize: 'clamp(24px,3vw,34px)' }}>{user.name || 'My account'}</h1>
        </div>
      </div>

      {sp.saved === 'profile' && <div className="notice ok" style={{ marginBottom: 16 }}>Your details have been saved.</div>}

      {/* 摘要 */}
      <div className="acct-stats">
        <div className="panel panel-pad">
          <span className="eyebrow">Orders</span>
          <div style={{ fontSize: 26, marginTop: 8, color: 'var(--text)' }}>{orderCount}</div>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>lifetime orders</div>
        </div>
        <div className="panel panel-pad">
          <span className="eyebrow">Member since</span>
          <div style={{ fontSize: 26, marginTop: 8, color: 'var(--text)' }}>{memberSince}</div>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>{user.email}</div>
        </div>
      </div>

      {/* 个人资料 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <span className="eyebrow"><T k="acct.ov_details" /></span>
        <form action={updateProfileAction} style={{ marginTop: 14, display: 'grid', gap: 14, maxWidth: 520 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="acct-name"><T k="acct.display_name" /></label>
            <input id="acct-name" className="input" name="name" defaultValue={user.name || ''} maxLength={40} placeholder={t('acct.display_name_ph')} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="acct-phone"><T k="acct.phone" /></label>
            <PhoneInput name="phone" defaultValue={user.phone || ''} id="acct-phone" ariaLabel="Phone" />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}><T k="acct.phone_hint" /></span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="acct-whatsapp"><T k="acct.whatsapp" /></label>
            <PhoneInput name="whatsapp" defaultValue={user.whatsapp || ''} id="acct-whatsapp" ariaLabel="WhatsApp" />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}><T k="acct.wa_hint" /></span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="acct-email"><T k="acct.email" /></label>
            <input id="acct-email" className="input" value={user.email} disabled />
            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}><T k="acct.email_hint" /></span>
          </div>
          <div>
            <button className="btn" type="submit"><T k="acct.save_details" /></button>
          </div>
        </form>
      </section>

      {/* 默认地址摘要 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow"><T k="acct.default_addr" /></span>
          <Link className="link-more" href="/account/addresses">{addr ? 'Edit' : 'Add'}</Link>
        </div>
        {addr ? (
          <p className="dim" style={{ marginTop: 10, lineHeight: 1.8 }}>
            {addr.address}<br />
            {addr.city}{addr.zip ? `, ${addr.zip}` : ''}<br />
            {addr.country}
          </p>
        ) : (
          <p className="dim" style={{ marginTop: 10 }}>
            <T k="acct.no_addr" /> — <Link href="/account/addresses" style={{ borderBottom: '1px solid var(--line-2)' }}><T k="acct.add_new" /></Link>
          </p>
        )}
      </section>

      {/* 安全 */}
      <section className="panel panel-pad" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="eyebrow"><T k="acct.nav_password" /></span>
          <Link className="link-more" href="/account/password"><T k="acct.edit" /></Link>
        </div>
        <p className="dim" style={{ marginTop: 10 }}>
          <T k="acct.pw_change_note" />
        </p>
      </section>
    </>
  );
}
