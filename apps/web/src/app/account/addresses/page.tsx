import Link from 'next/link';
import { getSessionUserFull, getUserAddresses } from '@/lib/users';
import { deleteAddressAction, setDefaultAddressAction } from '@/lib/auth-actions';
import { getLocaleFromCookies } from '@/lib/locale-server';
import { translate } from '@/lib/i18n';
import { T } from '@/components/ContentT9n';
import { AddressForm } from './AddressForm';

export const dynamic = 'force-dynamic';

export default async function AccountAddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; default?: string; edit?: string; add?: string }>;
}) {
  const user = await getSessionUserFull();
  const locale = await getLocaleFromCookies();
  const t = (k: string) => translate(locale, k);
  if (!user) return null; // layout 已做登录守卫
  const sp = await searchParams;
  const book = getUserAddresses(user);

  // 编辑模式：?edit=<id> 预填表单；?add=1 或无地址时直接显示空表单
  const editing = sp.edit ? book.find(a => a.id === sp.edit) : undefined;
  const showForm = sp.add === '1' || !!sp.edit || book.length === 0;

  return (
    <>
      <div className="page-head" style={{ padding: 0, marginBottom: 20 }}>
        <div>
          <span className="eyebrow">{t('acct.title')} · {t('acct.nav_addresses')}</span>
          <h1 style={{ marginTop: 6, fontSize: 'clamp(24px,3vw,34px)' }}><T k="acct.addr_h1" /></h1>
        </div>
      </div>

      {sp.saved && <div className="notice ok" style={{ marginBottom: 16 }}><T k="acct.addr_saved" /></div>}
      {sp.deleted && <div className="notice ok" style={{ marginBottom: 16 }}><T k="acct.addr_deleted" /></div>}
      {sp.default && <div className="notice ok" style={{ marginBottom: 16 }}><T k="acct.addr_default_set" /></div>}

      {/* 地址簿 */}
      {book.length > 0 && (
        <section className="panel panel-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="eyebrow"><T k="acct.addr_book" /></span>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 12 }}>
            {book.map((a, i) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--line-2)'}`,
                  borderRadius: 4, padding: 14, background: 'var(--surface-2, rgba(255,255,255,0.03))',
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  {i === 0 && <span className="tag on">{t('acct.default')}</span>}
                  <span className="mono dim" style={{ fontSize: 'var(--fs-micro)' }}>{a.country || '—'}</span>
                </div>
                <div style={{ fontSize: 'var(--fs-small)', color: 'var(--text)', lineHeight: 1.6 }}>
                  {a.address || '—'}<br />
                  {[a.city, a.zip].filter(Boolean).join(', ')}<br />
                  {a.country}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <Link className="link-more" href={`/account/addresses?edit=${a.id}`}><T k="acct.edit" /></Link>
                  {i !== 0 && (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="entryId" value={a.id} />
                      <button className="link-more" type="submit" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--fs-small)' }}><T k="acct.set_default" /></button>
                    </form>
                  )}
                  {book.length > 1 && (
                    <form action={deleteAddressAction}>
                      <input type="hidden" name="entryId" value={a.id} />
                      <button className="link-more" type="submit" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--fs-small)', color: '#E5484D' }}><T k="acct.delete" /></button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!showForm && (
            <Link className="btn btn-ghost btn-sm" href="/account/addresses?add=1" style={{ marginTop: 14 }}>＋ <T k="acct.add_new" /></Link>
          )}
        </section>
      )}

      {/* 新增 / 编辑表单 */}
      {showForm && (
        <section className="panel panel-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <span className="eyebrow">{editing ? <T k="acct.edit_addr" /> : <T k="acct.add_addr" />}</span>
            {book.length > 0 && <Link className="link-more" href="/account/addresses"><T k="acct.cancel" /></Link>}
          </div>
          <p className="dim" style={{ fontSize: 'var(--fs-small)', marginTop: 8 }}><T k="acct.addr_form_hint" /></p>
          <AddressForm
            entryId={editing?.id}
            initialAddress={editing?.address || ''}
            initialCity={editing?.city || ''}
            initialCountry={editing?.country || ''}
            initialZip={editing?.zip || ''}
          />
        </section>
      )}
    </>
  );
}
