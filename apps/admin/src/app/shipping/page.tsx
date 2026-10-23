import Link from 'next/link';
import { paths, readJsonl } from '@/lib/store';
import { addShipmentEvent, requirePage } from '@/lib/actions';
import { SyncButton } from '@/components/SyncButton';
import { OmsSyncButton } from '@/components/OmsSyncButton';
import { guestOrderPath } from '@/lib/order-token';
import type { Order } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;

const STATUS: [string, string][] = [
  ['in_transit', '运输中'],
  ['delivered', '已签收'],
  ['exception', '异常'],
];
const STATUS_LABEL: Record<string, string> = { pending: '待发货', shipped: '已发货', in_transit: '运输中', delivered: '已签收', exception: '异常' };

type ShipOrder = Order;

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  await requirePage('/shipping');
  const sp = await searchParams;
  const tab = sp.tab || 'all';
  const q = (sp.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(sp.page || 1));

  const carrierUrl = (o: ShipOrder) => {
    const t = o.shipment?.trackingNo || '';
    if (/dhl/i.test(o.shipment?.carrier || '')) return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(t)}`;
    if (/fedex/i.test(o.shipment?.carrier || '')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
    if (/ups/i.test(o.shipment?.carrier || '')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
    return `https://t.17track.net/en#nums=${encodeURIComponent(t)}`;
  };

  const all = readJsonl<ShipOrder>(paths.orders)
    .filter(o => o.shipment?.trackingNo || (o.shipment?.events?.length ?? 0) > 0)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const countBy = (s: string) => all.filter(o => (o.shipment?.status || 'pending') === s).length;
  const transit = countBy('in_transit') + countBy('shipped') + countBy('pending');
  const delivered = countBy('delivered');
  const exception = countBy('exception');

  // 筛选：all=全部；其余按物流状态
  let rows = all.filter(o => (tab === 'all' ? true : (o.shipment?.status || 'pending') === tab));
  if (q) {
    rows = rows.filter(o =>
      [o.orderNo, o.email, o.shipment?.trackingNo, o.shipment?.carrier].join(' ').toLowerCase().includes(q),
    );
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const items = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const tabLink = (t: string, label: string, count: number | null, on: boolean) => (
    <Link key={t} href={`/shipping?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
      className="btn btn-ghost btn-sm" style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
      {label}{count != null ? ` ${count}` : ''}
    </Link>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">销售 · 物流</span>
          <h1 style={{ marginTop: 6 }}>物流管理</h1>
          <div className="sub">共 {all.length} 个包裹 · 轨迹为手工维护的时间轴（免费方案）；接入 AfterShip / 17TRACK 后自动拉取。「客户链接」可发给客户免注册查单。</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-ghost" href="https://t.17track.net/en" target="_blank" rel="noopener noreferrer">17TRACK ↗</a>
          <OmsSyncButton />
          <SyncButton disabled={!all.some(o => o.shipment?.trackingNo)} />
        </div>
      </div>

      {/* 摘要 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <SumCard label="全部包裹" value={all.length} />
        <SumCard label="运输中" value={transit} />
        <SumCard label="已签收" value={delivered} />
        <SumCard label="异常" value={exception} bad={exception > 0} />
      </div>

      {/* 筛选 + 搜索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {tabLink('all', '全部', all.length, tab === 'all')}
        {STATUS.map(([s, l]) => tabLink(s, l, countBy(s), tab === s))}
        <form method="get" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <input type="hidden" name="tab" value={tab} />
          <input className="input" name="q" defaultValue={q} placeholder="搜订单 / 邮箱 / 追踪号" style={{ height: 30, width: 220 }} />
          <button className="btn btn-ghost btn-sm" type="submit">搜索</button>
        </form>
      </div>

      {/* 工作列表 */}
      <div className="a-card">
        {items.length ? (
          items.map(o => {
            const st = o.shipment?.status || 'pending';
            const events = [...(o.shipment?.events || [])].reverse();
            const latest = events[0];
            return (
              <div key={o.orderNo} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text)', fontWeight: 500 }}>{o.orderNo}</span>
                  <span className={`badge ${st === 'delivered' ? 'ok' : st === 'exception' ? 'bad' : 'accent'}`}>
                    {STATUS_LABEL[st] || st}
                  </span>
                  <span className="mono dim" style={{ fontSize: 'var(--fs-small)' }}>
                    {o.shipment?.carrier} · {o.shipment?.trackingNo}
                  </span>
                  <span style={{ flex: 1 }} />
                  <a className="btn btn-sm btn-ghost" href={carrierUrl(o)} target="_blank" rel="noopener noreferrer">承运商查询 ↗</a>
                  <a className="btn btn-sm btn-ghost" href={guestOrderPath(o.orderNo)} target="_blank" rel="noopener noreferrer"
                    title="客户免注册订单页（复制此链接发给客户）">客户链接 ↗</a>
                </div>
                <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>{o.email}</span>
                  <span>{o.items.reduce((s, i) => s + i.qty, 0)} 件 · ${Number(o.totalUsd).toFixed(2)}</span>
                  {latest && (
                    <span>
                      最新：{new Date(latest.time).toLocaleString('zh-CN', { hour12: false })} · {latest.description}
                    </span>
                  )}
                </div>

                {/* 展开才渲染完整轨迹 + 添加事件表单 */}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-micro)', color: 'var(--text-3)', width: 'fit-content' }}>管理轨迹</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginTop: 10 }}>
                    <div>
                      <span className="eyebrow">轨迹时间轴</span>
                      <div style={{ marginTop: 10 }}>
                        {events.length ? events.map((ev, i) => (
                          <div key={i} className="mini-row" style={{ alignItems: 'baseline' }}>
                            <span className="mono">{new Date(ev.time).toLocaleString('zh-CN', { hour12: false })}{ev.location ? ` · ${ev.location}` : ''}</span>
                            <span style={{ textAlign: 'right', color: i === 0 ? 'var(--text)' : undefined }}>{ev.description}</span>
                          </div>
                        )) : <p className="dim" style={{ marginTop: 10 }}>暂无轨迹事件</p>}
                      </div>
                    </div>
                    <form action={addShipmentEvent}>
                      <input type="hidden" name="orderNo" value={o.orderNo} />
                      <span className="eyebrow">添加轨迹事件</span>
                      <div className="form-grid" style={{ marginTop: 10, gridTemplateColumns: '1fr' }}>
                        <div className="field">
                          <label>时间（留空 = 现在）</label>
                          <input className="input" name="time" type="datetime-local" />
                        </div>
                        <div className="field">
                          <label>地点</label>
                          <input className="input" name="location" placeholder="Shenzhen, CN" />
                        </div>
                        <div className="field">
                          <label>描述（含 Delivered 自动标记签收）</label>
                          <input className="input" name="description" placeholder="Departed sorting center" required />
                        </div>
                      </div>
                      <button className="btn btn-sm" type="submit" style={{ marginTop: 4 }}>添加事件</button>
                    </form>
                  </div>
                </details>
              </div>
            );
          })
        ) : (
          <div className="dim" style={{ padding: '48px 16px', textAlign: 'center', fontSize: 'var(--fs-small)' }}>
            没有匹配的包裹 — 到「订单管理」给订单填写追踪号，或换个筛选条件。
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
          {page > 1
            ? <Link className="btn btn-ghost btn-sm" href={`/shipping?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}&page=${page - 1}`}>上一页</Link>
            : <span />}
          <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          {page < totalPages
            ? <Link className="btn btn-ghost btn-sm" href={`/shipping?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}&page=${page + 1}`}>下一页</Link>
            : <span />}
        </div>
      )}
    </>
  );
}

function SumCard({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="a-card a-card-pad">
      <span className="eyebrow">{label}</span>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6, color: bad ? 'var(--bad, #E5484D)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}
