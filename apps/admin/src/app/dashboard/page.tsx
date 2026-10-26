import Link from 'next/link';
import { PRODUCTS } from '@kitvault/shared';
import { paths, readJson, readJsonl } from '@/lib/store';
import { buildCustomers, computeMetrics, fmtTime, fmtUsd, type Event, type Order, type Contact } from '@/lib/metrics';
import { requirePage } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const DAY = 864e5;

export default async function DashboardPage() {
  await requirePage('/dashboard');
  const orders = readJsonl<Order>(paths.orders);
  const events = readJsonl<Event>(paths.events);
  const contacts = readJsonl<Contact>(paths.contacts);
  const followups = readJson<{ status: string; nextAt?: string | null; email?: string }[]>(paths.followups, []);
  const overrides = readJson<Record<string, { status?: string }>>(paths.overrides, {});
  const imported = readJson<{ h: string }[]>(paths.imported, []);

  const statusOf = (h: string) => overrides[h]?.status ?? 'active';
  const allHandles = [...PRODUCTS.map(p => p.h), ...imported.map(p => p.h)];
  const productCounts = {
    active: allHandles.filter(h => statusOf(h) === 'active').length,
    draft: allHandles.filter(h => statusOf(h) === 'draft').length,
  };
  const titleOf = (h: string) => PRODUCTS.find(p => p.h === h)?.t ?? PRODUCTS.find(p => h.startsWith(p.h))?.t ?? h;

  const m = computeMetrics(orders, events, contacts, followups, productCounts);
  const customers = buildCustomers(events, orders, contacts);
  const repeatBuyers = customers.filter(c => c.repeatBuyer).length;
  const recentOrders = [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  const dueFollowups = followups
    .filter(f => f.status === 'pending')
    .sort((a, b) => String(a.nextAt || '').localeCompare(String(b.nextAt || '')))
    .slice(0, 8);
  const topViewed = events
    .filter(e => e.type === 'view_product' && e.handle)
    .reduce<Record<string, number>>((acc, e) => { acc[e.handle!] = (acc[e.handle!] || 0) + 1; return acc; }, {});
  const topList = Object.entries(topViewed).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 近 7 天订单 / 收入（按天下单时间统计）
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = today0.getTime() - (6 - i) * DAY;
    const inDay = orders.filter(o => { const t = new Date(o.createdAt).getTime(); return t >= start && t < start + DAY; });
    return {
      label: new Date(start).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      count: inDay.length,
      usd: Math.round(inDay.reduce((s, o) => s + (Number(o.totalUsd) || 0), 0) * 100) / 100,
    };
  });
  const maxCount = Math.max(1, ...days.map(d => d.count));

  const unshippedOrders = orders.filter(o => ['unfulfilled', 'packing'].includes(o.fulfillmentStatus || ''));
  const overdueFollowups = followups.filter(f => f.status === 'pending' && f.nextAt && new Date(f.nextAt).getTime() < Date.now());

  // —— 退款统计 ——
  const refundedOrders = orders.filter(o => o.paymentStatus === 'refunded');
  const refundUsd = refundedOrders.reduce((sum, o) => sum + (Number(o.totalUsd) || 0), 0);
  const refundRate = orders.length ? Math.round((refundedOrders.length / orders.length) * 1000) / 10 : 0;

  // —— 支付方式构成 ——
  const PM_LABEL: Record<string, string> = { cod: '货到付款', online: '在线支付', transfer: '银行转账', pending: '待支付', paid: '已支付', failed: '失败', refunded: '已退款' };
  const payMix = Object.entries(
    orders.reduce<Record<string, { count: number; usd: number }>>((acc, o) => {
      const k = o.paymentMethod || 'cod';
      acc[k] = acc[k] || { count: 0, usd: 0 };
      acc[k].count++;
      acc[k].usd += Number(o.totalUsd) || 0;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count);

  // —— 转化漏斗（埋点聚合）——
  const evCount = (t: string) => events.filter(e => e.type === t).length;
  const funnel = [
    { label: '浏览商品', n: evCount('view_product') },
    { label: '加入购物车', n: evCount('add_to_cart') },
    { label: '开始结算', n: evCount('checkout_start') },
    { label: '下单', n: orders.length },
  ];
  const visitors7d = new Set(
    events.filter(e => Date.now() - new Date(e.ts).getTime() <= 7 * DAY && e.visitorId).map(e => e.visitorId),
  ).size;

  // —— 销量 Top5（按下单件数）——
  const salesAgg = orders.reduce<Record<string, { title: string; qty: number; usd: number }>>((acc, o) => {
    for (const it of o.items || []) {
      acc[it.handle] = acc[it.handle] || { title: it.title, qty: 0, usd: 0 };
      acc[it.handle].qty += it.qty || 0;
      acc[it.handle].usd += (Number(it.priceUsd) || 0) * (it.qty || 0);
    }
    return acc;
  }, {});
  const salesTop = Object.entries(salesAgg).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">数据看板</span>
          <h1 style={{ marginTop: 6 }}>经营总览</h1>
          <div className="sub">订单、履约、客户与流量的实时汇总 · 近 7 天趋势 · 待办事项直达</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-ghost" href="/api/export?type=events">导出埋点 CSV</Link>
          <Link className="btn btn-ghost" href="/api/export?type=orders">导出订单 CSV</Link>
        </div>
      </div>

      {/* —— 今日待办（该做的事直达入口）—— */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <Link href="/orders?status=pending" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="eyebrow">待支付订单</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <b style={{ fontSize: 24 }}>{m.pendingPayment}</b>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>笔 · 去人工确认收款 →</span>
          </div>
        </Link>
        <Link href="/orders?status=unfulfilled" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="eyebrow">待发货订单</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <b style={{ fontSize: 24 }}>{unshippedOrders.length}</b>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>笔 · 去绑定运单号发货 →</span>
          </div>
        </Link>
        <Link href="/customers/followup" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="eyebrow">逾期回访</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <b style={{ fontSize: 24, color: overdueFollowups.length ? 'var(--bad, #E5484D)' : 'var(--text)' }}>{overdueFollowups.length}</b>
            <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>条 · 去回访工作台 →</span>
          </div>
        </Link>
      </div>

      {/* —— 生意概览 —— */}
      <span className="eyebrow">生意概览</span>
      <div className="kpi-grid" style={{ marginTop: 10 }}>
        <div className="kpi accent">
          <div className="k-label">累计营收（USD）</div>
          <div className="k-value">{fmtUsd(m.revenueUsd)}</div>
          <div className="k-sub">今日 {fmtUsd(m.revenueTodayUsd)} · 客单 {fmtUsd(m.avgOrderUsd)}</div>
        </div>
        <div className="kpi">
          <div className="k-label">累计订单</div>
          <div className="k-value">{m.ordersTotal}</div>
          <div className="k-sub">今日 +{m.ordersToday}</div>
        </div>
        <div className="kpi">
          <div className="k-label">客户档案</div>
          <div className="k-value">{customers.length}</div>
          <div className="k-sub">回购 {repeatBuyers} · 留联系方式 {customers.filter(c => c.hasContact).length}</div>
        </div>
        <div className="kpi">
          <div className="k-label">在售商品</div>
          <div className="k-value">{productCounts.active}</div>
          <div className="k-sub">草稿 {m.draftProducts} · 今日行为 {m.eventsToday}</div>
        </div>
      </div>

      {/* —— 近 7 天趋势 —— */}
      <span className="eyebrow" style={{ display: 'block', marginTop: 20 }}>近 7 天订单趋势</span>
      <div className="a-card a-card-pad" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 140 }}>
          {days.map(d => (
            <div key={d.label} style={{ flex: 1, textAlign: 'center' }}>
              <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginBottom: 4 }}>{d.count || ''}</div>
              <div
                title={`${d.label} · ${d.count} 单 · $${d.usd}`}
                style={{
                  height: Math.max(4, Math.round((d.count / maxCount) * 100)),
                  background: d.count ? 'var(--accent)' : 'var(--line-2)',
                  borderRadius: '3px 3px 0 0', margin: '0 auto', width: '60%', transition: 'height .2s',
                }}
              />
              <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 6 }}>{d.label}</div>
            </div>
          ))}
        </div>
        <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 10 }}>
          7 日合计 {days.reduce((s, d) => s + d.count, 0)} 单 · ${days.reduce((s, d) => s + d.usd, 0).toFixed(2)}
        </div>
      </div>

      {/* —— 履约与物流 —— */}
      <span className="eyebrow" style={{ display: 'block', marginTop: 20 }}>履约与物流</span>
      <div className="kpi-grid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="kpi">
          <div className="k-label">待支付</div>
          <div className="k-value">{m.pendingPayment}</div>
          <div className="k-sub">人工确认收款</div>
        </div>
        <div className="kpi">
          <div className="k-label">未发货</div>
          <div className="k-value">{m.unshipped}</div>
          <div className="k-sub">运输中 {m.shipped} · 已签收 {m.delivered}</div>
        </div>
        <div className="kpi">
          <div className="k-label">待回访</div>
          <div className="k-value">{m.followupsDue}</div>
          <div className="k-sub">逾期 {m.followupsOverdue}</div>
        </div>
        <div className="kpi">
          <div className="k-label">今日行为</div>
          <div className="k-value">{m.eventsToday}</div>
          <div className="k-sub">新留言 {m.newContactsToday}</div>
        </div>
        <div className="kpi" style={refundedOrders.length ? { outline: '1px solid var(--bad, #E5484D)' } : undefined}>
          <div className="k-label">退款</div>
          <div className="k-value" style={refundedOrders.length ? { color: 'var(--bad, #E5484D)' } : undefined}>{fmtUsd(refundUsd)}</div>
          <div className="k-sub">{refundedOrders.length} 笔 · 退款率 {refundRate}%</div>
        </div>
      </div>

      {/* —— 支付方式构成 + 转化漏斗 —— */}
      <div className="cols" style={{ marginTop: 16 }}>
        <div className="a-card a-card-pad">
          <span className="eyebrow">支付方式构成</span>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {payMix.length ? payMix.map(([k, v]) => {
              const maxC = payMix[0][1].count;
              return (
                <div key={k}>
                  <div className="mini-row" style={{ marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-2)' }}>{PM_LABEL[k] || k}</span>
                    <b>{v.count} 单 · {fmtUsd(v.usd)}</b>
                  </div>
                  <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 3 }}>
                    <div style={{ width: `${Math.round((v.count / maxC) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                </div>
              );
            }) : <div className="empty">暂无订单</div>}
          </div>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 10 }}>
            近 7 天独立访客：{visitors7d}
          </div>
        </div>

        <div className="a-card a-card-pad">
          <span className="eyebrow">转化漏斗（全量埋点）</span>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {funnel.map((st, i) => {
              const prev = i > 0 ? funnel[i - 1].n : 0;
              // 上级为 0 或本级反超上级（历史埋点缺失/双计）时显示 —，避免出现 1100% 这类误导数字
              const rate = i > 0 && prev > 0 && st.n <= prev ? Math.round((st.n / prev) * 1000) / 10 + '%' : '—';
              const maxN = Math.max(1, funnel[0].n);
              return (
                <div key={st.label}>
                  <div className="mini-row" style={{ marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-2)' }}>{st.label}</span>
                    <span><b>{st.n}</b>{i > 0 && <span className="dim"> · 上级转化 {rate}</span>}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--line-2)', borderRadius: 3 }}>
                    <div style={{ width: `${Math.round((Math.min(st.n, maxN) / maxN) * 100)}%`, height: '100%', background: i === funnel.length - 1 ? 'var(--accent)' : 'var(--text-3)', borderRadius: 3, opacity: 0.9 - i * 0.12 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="a-card">
          <div className="a-card-pad" style={{ paddingBottom: 6 }}>
            <span className="eyebrow">最新订单</span>
          </div>
          {recentOrders.length ? (
            <div style={{ padding: '6px 18px 14px' }}>
              {recentOrders.map(o => (
                <div className="mini-row" key={o.orderNo}>
                  <span>
                    <Link href={`/orders?q=${encodeURIComponent(o.orderNo)}`} className="mono" style={{ color: 'var(--text-2)' }}>{o.orderNo}</Link>
                    <span className="dim"> · {o.email}</span>
                  </span>
                  <span>
                    <b>{fmtUsd(o.totalUsd)}</b>{' '}
                    <span className={`badge ${o.paymentStatus === 'paid' ? 'ok' : o.paymentStatus === 'pending' ? 'warn' : o.paymentStatus === 'cod' ? 'accent' : 'bad'}`}>{o.paymentStatus}</span>{' '}
                    <span className="badge plain">{o.fulfillmentStatus}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">还没有订单 — 前台下单后这里会实时出现</div>
          )}
        </div>

        <div className="a-card">
          <div className="a-card-pad" style={{ paddingBottom: 6 }}>
            <span className="eyebrow">回访提醒（待回访）</span>
          </div>
          {dueFollowups.length ? (
            <div style={{ padding: '6px 18px 14px' }}>
              {dueFollowups.map((f, i) => {
                const overdue = f.nextAt && new Date(f.nextAt).getTime() < Date.now();
                return (
                  <div className="mini-row" key={i}>
                    <span>{f.email || '(未留邮箱)'}</span>
                    <span className={overdue ? '' : 'dim'} style={overdue ? { color: 'var(--bad)' } : undefined}>
                      下次跟进 {f.nextAt ? fmtTime(String(f.nextAt)) : '未设置'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">暂无待回访 — 在「客户管理」中把高意向客户加入回访</div>
          )}
          <div className="a-card-pad" style={{ borderTop: '1px solid var(--line)' }}>
            <Link className="btn btn-ghost btn-sm" href="/customers/followup">打开回访工作台</Link>
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="a-card">
          <div className="a-card-pad" style={{ paddingBottom: 6 }}>
            <span className="eyebrow">浏览最多的商品（埋点 view_product）</span>
          </div>
          {topList.length ? (
            <div style={{ padding: '6px 18px 14px' }}>
              {topList.map(([handle, n]) => {
                const max = topList[0][1];
                return (
                  <div key={handle} style={{ marginBottom: 10 }}>
                    <div className="mini-row" style={{ marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '46ch' }}>
                        {titleOf(handle)}
                      </span>
                      <b>{n} 次</b>
                    </div>
                    <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 3 }}>
                      <div style={{ width: `${Math.round((n / max) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">暂无浏览数据</div>
          )}
        </div>

        <div className="a-card">
          <div className="a-card-pad" style={{ paddingBottom: 6 }}>
            <span className="eyebrow">销量 Top 5（按订单件数）</span>
          </div>
          {salesTop.length ? (
            <div style={{ padding: '6px 18px 14px' }}>
              {salesTop.map(([handle, v], i) => {
                const max = salesTop[0][1].qty;
                return (
                  <div key={handle} style={{ marginBottom: 10 }}>
                    <div className="mini-row" style={{ marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40ch' }}>
                        {i + 1}. {v.title}
                      </span>
                      <b>{v.qty} 件</b>
                    </div>
                    <div style={{ height: 6, background: 'var(--line-2)', borderRadius: 3 }}>
                      <div style={{ width: `${Math.round((v.qty / max) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">暂无销量数据 — 前台下单后这里按件数排序</div>
          )}
        </div>
      </div>
    </>
  );
}
