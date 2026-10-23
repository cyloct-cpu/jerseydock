import Link from 'next/link';
import { paths, readJson, readJsonl } from '@/lib/store';
import { buildCustomers, fmtTime, fmtUsd, type Contact, type Event, type Order } from '@/lib/metrics';
import { saveFollowUp, requirePage } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  await requirePage('/customers');
  const sp = await searchParams;
  const filter = sp.filter || '';
  const q = (sp.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(sp.page || 1));

  const events = readJsonl<Event>(paths.events);
  const orders = readJsonl<Order>(paths.orders);
  const contacts = readJsonl<Contact>(paths.contacts);
  const users = readJsonl<{ email: string; name?: string; whatsapp?: string; phone?: string; createdAt?: string; lastLoginAt?: string }>(paths.users);
  const followups = readJson<{ customerKey: string }[]>(paths.followups, []);
  const followedKeys = new Set(followups.map(f => f.customerKey));

  const customers = buildCustomers(events, orders, contacts, users);
  const filtered = customers.filter(c => {
    if (filter === 'no-orders' && c.orderCount > 0) return false;
    if (filter === 'has-contact' && !c.hasContact) return false;
    if (filter === 'repeat' && !c.repeatBuyer) return false;
    if (filter === 'cart-no-order' && !(c.cartCount > 0 && c.orderCount === 0)) return false;
    if (q && !`${c.email} ${c.key} ${c.nickname || ''} ${c.realName || ''} ${c.phone || ''} ${c.whatsapp || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const FILTERS: [string, string][] = [
    ['', '全部'],
    ['cart-no-order', '加购未付款'],
    ['no-orders', '未下单'],
    ['has-contact', '已留联系方式'],
    ['repeat', '回购 ≥ 2'],
  ];

  const waHref = (num: string) => 'https://wa.me/' + num.replace(/[^0-9]/g, '');

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CRM</span>
          <h1 style={{ marginTop: 6 }}>客户管理</h1>
          <div className="sub">
            {customers.length} 个客户档案 · 当前筛选 {filtered.length} 个 · 第 {safePage}/{totalPages} 页
            <span className="dim">（埋点 visitorId 与订单 email 自动合并）</span>
          </div>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 6 }}>
            已支付总金额仅计「已付款」订单；货到付款收款后在「订单管理」点「标记已支付」，金额会自动计入。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn btn-ghost" href="/api/export?type=customers">导出 CSV</Link>
          <Link className="btn btn-ghost" href="/customers/followup">回访工作台</Link>
        </div>
      </div>

      <form className="toolbar" method="get" action="/customers">
        <div className="field" style={{ minWidth: 260 }}>
          <label>搜索（邮箱 / 昵称 / 姓名 / 电话 / WhatsApp / 访客 ID）</label>
          <input className="input" name="q" defaultValue={sp.q || ''} placeholder="客户任意信息" />
        </div>
        <div className="field">
          <label>常用筛选</label>
          <select className="select" name="filter" defaultValue={filter}>
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="btn" type="submit">筛选</button>
        {(q || filter) && <Link className="btn btn-ghost" href="/customers">重置</Link>}
      </form>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th>客户</th>
              <th>注册</th>
              <th>电话</th>
              <th>WP</th>
              <th>注册 / 末次上线</th>
              <th>浏览总数</th>
              <th>加购</th>
              <th>订单</th>
              <th>订单总金额</th>
              <th>已支付总金额</th>
              <th>退款</th>
              <th>回访</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const wa = c.whatsapp;
              return (
                <tr key={c.key}>
                  <td className="wrap">
                    {c.nickname && <div style={{ color: 'var(--text)' }}>{c.nickname}</div>}
                    {c.realName && <div style={{ color: 'var(--text-2)', fontSize: 'var(--fs-small)' }}>{c.realName}</div>}
                    <div className="mono dim" style={{ fontSize: 'var(--fs-micro)' }}>
                      {c.email || <span className="dim">（未留邮箱）</span>}
                      {c.email && c.key !== c.email ? ` · ${c.key}` : ''}
                    </div>
                  </td>
                  <td>
                    {c.registeredAt ? <span className="badge ok">已注册</span> : <span className="dim">游客</span>}
                  </td>
                  <td className="mono" style={{ fontSize: 'var(--fs-small)' }}>{c.phone || <span className="dim">—</span>}</td>
                  <td>
                    {wa ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {/* 绿色 WP 徽标本身即可点击，直达 WhatsApp 对话 */}
                        <a
                          href={waHref(wa)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge ok"
                          title="在 WhatsApp 打开对话"
                          style={{ textDecoration: 'none', cursor: 'pointer' }}
                        >WP</a>
                        <span className="mono" style={{ fontSize: 'var(--fs-small)' }}>{wa}</span>
                      </span>
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
                    {c.registeredAt ? <>注册 {fmtTime(c.registeredAt).slice(0, 10)}<br /></> : null}
                    末次 {fmtTime(c.lastLoginAt || c.lastSeenAt).slice(0, 10)}
                  </td>
                  <td>{c.viewCount}</td>
                  <td>{c.cartCount}</td>
                  <td>
                    {c.orderCount > 0
                      ? <span className={`badge ${c.repeatBuyer ? 'ok' : 'accent'}`}>{c.orderCount} 单</span>
                      : <span className="dim">0</span>}
                  </td>
                  <td style={{ color: 'var(--text)' }}>{fmtUsd(c.ltvUsd)}</td>
                  <td>
                    <b style={{ color: c.paidUsd > 0 ? 'var(--accent)' : 'var(--text-3)' }}>{fmtUsd(c.paidUsd)}</b>
                  </td>
                  <td>
                    {c.refundCount > 0
                      ? <span className="badge bad" title={`退款金额 ${(c.refundUsd || 0).toFixed(2)}`}>退款 {c.refundCount} 次</span>
                      : <span className="dim">—</span>}
                  </td>
                  <td>
                    {followedKeys.has(c.key) ? (
                      <span className="badge accent">已在回访</span>
                    ) : (
                      <form action={saveFollowUp}>
                        <input type="hidden" name="customerKey" value={c.key} />
                        <input type="hidden" name="email" value={c.email} />
                        <input type="hidden" name="status" value="pending" />
                        <button className="btn btn-sm btn-ghost" type="submit">加入回访</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={12}><div className="empty">没有匹配的客户</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(n => {
            const qs = new URLSearchParams();
            if (filter) qs.set('filter', filter);
            if (q) qs.set('q', q);
            qs.set('page', String(n));
            return <a key={n} className="btn btn-ghost btn-sm" href={`/customers?${qs.toString()}`}>{n}</a>;
          })}
        </div>
      )}
    </>
  );
}
