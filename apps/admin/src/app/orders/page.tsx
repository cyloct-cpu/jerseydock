import Link from 'next/link';
import { paths, readJsonl } from '@/lib/store';
import {
  batchShip, deleteOrders, setOrderPayment, shipOrder, requirePage,
  setCodCollected, setCodRefused, retryOmsPush, pushOrdersToOms,
} from '@/lib/actions';
import { OrdersBulkBar, ConfirmSubmit } from '@/components/OrdersBulkBar';
import { moneyStateOf, payMethodLabel, MONEY_LABEL, MONEY_CHIPS, type MoneyKey } from '@/lib/money-state';
import type { Order } from '@/lib/metrics';
import { guestOrderPath } from '@/lib/order-token';
import type { OmsOrderInfo } from '@/lib/oms';

export const dynamic = 'force-dynamic';

const CARRIERS = ['yunexpress', '4px', 'yanwen', 'dhl', 'fedex', 'ups', 'china-post', 'other'];

const PAYMENT_LABEL: Record<string, string> = { pending: '待支付', paid: '已支付', failed: '失败', refunded: '已退款', cod: '货到付款', transfer: '转账待确认' };
const FULFILLMENT_LABEL: Record<string, string> = {
  unfulfilled: '未发货', packing: '打包中', shipped: '已发货', in_transit: '运输中', delivered: '已签收', exception: '异常',
};

const MONEY_STATES: MoneyKey[] = Object.keys(MONEY_LABEL) as MoneyKey[];
/** 履约下拉的伪选项：按 OMS 推送状态过滤 */
const FUL_EXTRA = [{ v: 'awaiting', label: '待推送（未推 OMS）' }, { v: 'push_failed', label: '推送失败' }];

type Ord = Order & {
  phone?: string;
  codConfirmedAt?: string;
  deliveredAt?: string;
  oms?: OmsOrderInfo;
};

const PER_PAGE = 30;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    m?: string; q?: string; money?: string; pm?: string; ful?: string; days?: string; page?: string;
    shipped?: string; failed?: string; deleted?: string; pushed?: string;
  }>;
}) {
  await requirePage('/orders');
  const sp = await searchParams;
  const now = Date.now();
  const month = new Date().toISOString().slice(0, 7);

  const orders = readJsonl<Ord>(paths.orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const ms = new Map<string, ReturnType<typeof moneyStateOf>>();
  for (const o of orders) ms.set(o.orderNo, moneyStateOf(o));

  const q = (sp.q || '').trim().toLowerCase();
  const money = sp.money || '';
  const pm = sp.pm || '';
  const ful = sp.ful || '';
  const days = Number(sp.days || 0);
  const chip = sp.m || '';
  const page = Math.max(1, Number(sp.page || 1));

  const chipStates = new Set(MONEY_CHIPS.find(c => c.key === chip)?.states ?? []);

  const filtered = orders.filter(o => {
    const s = ms.get(o.orderNo)!;
    if (q && !(`${o.orderNo} ${o.email} ${o.name || ''} ${o.shipment?.trackingNo || ''} ${o.oms?.orderNumber || ''}`.toLowerCase().includes(q))) return false;
    if (money && s.key !== money) return false;
    if (chipStates.size && !chipStates.has(s.key)) return false;
    if (pm) {
      const method = o.paymentMethod || (o.paymentStatus === 'cod' ? 'cod' : 'online');
      if (method !== pm) return false;
    }
    if (ful === 'awaiting') { if (o.shipment?.trackingNo || o.oms?.pushError) return false; }
    else if (ful === 'push_failed') { if (!o.oms?.pushError) return false; }
    else if (ful && o.fulfillmentStatus !== ful) return false;
    if (days > 0 && Date.parse(o.createdAt) < now - days * 86400000) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // 统计（基于全部订单，不受筛选影响）
  const codSigned = orders.filter(o => ms.get(o.orderNo)!.key === 'cod_signed');
  const codSignedUsd = codSigned.reduce((s, o) => s + (Number(o.totalUsd) || 0), 0);
  const overdueCount = codSigned.filter(o => ms.get(o.orderNo)!.overdue).length;
  const pushFailed = orders.filter(o => ms.get(o.orderNo)!.key === 'cod_push_failed').length;
  const collectedThisMonth = orders.filter(o => (o.codConfirmedAt || '').startsWith(month));
  const collectedUsd = collectedThisMonth.reduce((s, o) => s + (Number(o.totalUsd) || 0), 0);

  const chipCount = (key: string) => {
    const states = new Set(MONEY_CHIPS.find(c => c.key === key)?.states ?? []);
    return states.size ? orders.filter(o => states.has(ms.get(o.orderNo)!.key)).length : orders.length;
  };

  const qs = new URLSearchParams();
  if (chip && chip !== 'all') qs.set('m', chip);
  if (q) qs.set('q', q);
  if (money) qs.set('money', money);
  if (pm) qs.set('pm', pm);
  if (ful) qs.set('ful', ful);
  if (days) qs.set('days', String(days));
  const base = qs.toString();
  const chipActive = (key: string) => (key === 'all' ? !chip : chip === key);

  const badge = (tone: string) => `badge ${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'bad' ? 'bad' : tone === 'accent' ? 'accent' : ''}`;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Sales</span>
          <h1 style={{ marginTop: 6 }}>订单管理</h1>
          <div className="sub">共 {orders.length} 单 · 当前筛选 {filtered.length} 单 · 第 {safePage}/{totalPages} 页</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-ghost" href="/api/export?type=orders">导出 CSV</Link>
        </div>
      </div>

      {sp.pushed && <div className="notice ok">OMS 推送完成：{sp.pushed} 单成功{Number(sp.failed) ? `，${sp.failed} 单失败（见行内原因）` : ''}。</div>}
      {sp.shipped && <div className="notice ok">批量发货完成：{sp.shipped} 单成功{Number(sp.failed) ? `，${sp.failed} 单失败` : ''}。</div>}
      {sp.deleted && <div className="notice ok">已删除 {sp.deleted} 个订单。</div>}

      {/* 统计卡片条：点击即筛选 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, margin: '0 0 12px' }}>
        <Link className="a-card a-card-pad" href={`/orders?${baseWith({ m: 'cod_signed' })}`} style={{ textDecoration: 'none' }}>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>COD 待回款</div>
          <div style={{ fontSize: 20, color: 'var(--accent)' }}>${codSignedUsd.toFixed(2)} <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>· {codSigned.length} 单</span></div>
        </Link>
        <Link className="a-card a-card-pad" href={`/orders?${baseWith({ m: 'cod_signed' })}`} style={{ textDecoration: 'none', ...(overdueCount ? { borderColor: '#E5484D' } : {}) }}>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>签收超期未回款 ⚠</div>
          <div style={{ fontSize: 20, color: overdueCount ? '#E5484D' : 'var(--text-2)' }}>{overdueCount} 单</div>
        </Link>
        <Link className="a-card a-card-pad" href={`/orders?${baseWith({ money: 'cod_push_failed' })}`} style={{ textDecoration: 'none', ...(pushFailed ? { borderColor: '#E5484D' } : {}) }}>
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>推送失败</div>
          <div style={{ fontSize: 20, color: pushFailed ? '#E5484D' : 'var(--text-2)' }}>{pushFailed} 单</div>
        </Link>
        <div className="a-card a-card-pad">
          <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>本月已回款</div>
          <div style={{ fontSize: 20, color: 'var(--ok, #46A758)' }}>${collectedUsd.toFixed(2)} <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>· {collectedThisMonth.length} 单</span></div>
        </div>
      </div>

      <OrdersBulkBar />

      {/* 快捷筛选 chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
        {[{ key: 'all', label: '全部' }, ...MONEY_CHIPS].map(c => (
          <Link key={c.key} className={`btn btn-sm ${chipActive(c.key) ? '' : 'btn-ghost'}`} href={`/orders?${baseWith({ m: c.key === 'all' ? '' : c.key })}`}>
            {c.label} {chipCount(c.key)}
          </Link>
        ))}
      </div>

      <form className="toolbar" method="get" action="/orders">
        <div className="field" style={{ minWidth: 220 }}>
          <label>搜索（订单号 / 邮箱 / 姓名 / 快递单号）</label>
          <input className="input" name="q" defaultValue={sp.q || ''} placeholder="KV-… 或邮箱或单号" />
        </div>
        <div className="field">
          <label>款项状态</label>
          <select className="select" name="money" defaultValue={money}>
            <option value="">全部</option>
            {MONEY_STATES.map(k => <option key={k} value={k}>{MONEY_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label>支付方式</label>
          <select className="select" name="pm" defaultValue={pm}>
            <option value="">全部</option>
            <option value="cod">货到付款 COD</option>
            <option value="online">在线支付</option>
            <option value="transfer">银行转账</option>
          </select>
        </div>
        <div className="field">
          <label>履约状态</label>
          <select className="select" name="ful" defaultValue={ful}>
            <option value="">全部</option>
            {FUL_EXTRA.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
            {Object.entries(FULFILLMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>下单时间</label>
          <select className="select" name="days" defaultValue={String(days || '')}>
            <option value="">全部</option>
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="90">近 90 天</option>
          </select>
        </div>
        <button className="btn" type="submit">筛选</button>
        {(q || money || pm || ful || days || chip) && <Link className="btn btn-ghost" href="/orders">重置</Link>}
      </form>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th><th>订单号</th><th>时间</th><th>客户</th><th>商品</th><th>金额</th><th style={{ minWidth: 190 }}>款项</th><th style={{ minWidth: 190 }}>物流</th><th style={{ minWidth: 250 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => {
              const s = ms.get(o.orderNo)!;
              const hasTrack = Boolean(o.shipment?.trackingNo);
              const pushFailedRow = s.key === 'cod_push_failed';
              const canPush = !hasTrack;
              return (
                <tr key={o.orderNo}>
                  <td><input type="checkbox" name="orderNos" value={o.orderNo} form="orders-bulk-delete" /></td>
                  <td className="mono" style={{ color: 'var(--text-2)' }}>{o.orderNo}</td>
                  <td className="dim">{new Date(o.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                  <td className="wrap">
                    <div style={{ color: 'var(--text)' }}>{o.email}</div>
                    <div className="dim">{o.name || ''}{(o as unknown as { country?: string }).country ? ` · ${(o as unknown as { country?: string }).country}` : ''}</div>
                  </td>
                  <td className="wrap">
                    {o.items.map((it, i) => (
                      <div key={i}>
                        {it.title} <span className="dim">×{it.qty} ({it.size})</span>
                        {(it.customText || it.armband) && (
                          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)' }}>
                            {it.customText ? `烫印 ${it.customText}` : ''}{it.customText && it.armband ? ' · ' : ''}{it.armband ? `袖章 ${it.armband}` : ''}
                            {it.customFeeUsd ? ` (+$${Number(it.customFeeUsd).toFixed(2)})` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </td>
                  <td style={{ color: 'var(--text)' }}>${Number(o.totalUsd).toFixed(2)}</td>
                  <td>
                    <span className={badge(s.tone)}>{s.label}</span>
                    <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4 }}>
                      {payMethodLabel(o)} · {o.paymentStatus === 'paid' ? '已收全款' : `$${Number(o.totalUsd).toFixed(2)}`}
                    </div>
                    {s.reason && <div style={{ fontSize: 'var(--fs-micro)', color: s.overdue || s.tone === 'bad' ? '#E5484D' : 'var(--text-3)', marginTop: 2 }}>{s.reason}</div>}
                    {s.key === 'cod_signed' && (
                      <form action={setCodCollected} style={{ marginTop: 6 }}>
                        <input type="hidden" name="orderNo" value={o.orderNo} />
                        <button className="btn btn-sm" type="submit">标记回款</button>
                      </form>
                    )}
                    {s.key === 'cod_signed' && (
                      <form action={setCodRefused} style={{ marginTop: 4 }}>
                        <input type="hidden" name="orderNo" value={o.orderNo} />
                        <ConfirmSubmit className="btn btn-sm btn-ghost" label="标记拒收" message={`确认订单 ${o.orderNo} 被客户拒收？将转为异常并记入轨迹。`} />
                      </form>
                    )}
                    {!isCodRow(o) && o.paymentStatus !== 'paid' && o.paymentStatus !== 'refunded' && (
                      <form action={setOrderPayment} style={{ marginTop: 6 }}>
                        <input type="hidden" name="orderNo" value={o.orderNo} />
                        <input type="hidden" name="status" value="paid" />
                        <button className="btn btn-sm btn-ghost" type="submit">标记已支付</button>
                      </form>
                    )}
                    {o.paymentStatus !== 'refunded' && (
                      <form action={setOrderPayment} style={{ marginTop: 4 }}>
                        <input type="hidden" name="orderNo" value={o.orderNo} />
                        <input type="hidden" name="status" value="refunded" />
                        <button className="btn btn-sm btn-ghost" type="submit" style={{ color: '#E5484D' }}>标记退款</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {hasTrack ? (
                      <>
                        <span className={`badge ${o.fulfillmentStatus === 'delivered' ? 'ok' : o.fulfillmentStatus === 'exception' ? 'bad' : o.fulfillmentStatus === 'unfulfilled' ? 'warn' : 'accent'}`}>
                          {FULFILLMENT_LABEL[o.fulfillmentStatus] || o.fulfillmentStatus}
                        </span>
                        <div className="mono" style={{ marginTop: 6 }}>{o.shipment?.carrier} · {o.shipment?.trackingNo}</div>
                        {o.oms?.lastTrackStatus && (
                          <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 2 }}>最新：{o.oms.lastTrackStatus}{o.oms.lastTrackAt ? ` · ${fmtTime(o.oms.lastTrackAt)}` : ''}</div>
                        )}
                      </>
                    ) : pushFailedRow ? (
                      <>
                        <span className="badge bad">推送失败</span>
                        <div style={{ fontSize: 'var(--fs-micro)', color: '#E5484D', marginTop: 4, maxWidth: 200 }}>{o.oms?.pushError}</div>
                      </>
                    ) : (
                      <span className="badge">待推送</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {hasTrack && (
                        <>
                          <Link className="btn btn-sm btn-ghost" href={`/shipping?q=${encodeURIComponent(o.orderNo)}`}>管理轨迹</Link>
                          <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer"
                            href={guestOrderPath(o.orderNo)} title="客户免注册订单页（复制此链接发给客户）">
                            客户链接 ↗
                          </a>
                          {o.oms?.labelPath && (
                            <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href={`/api/oms/label/${o.orderNo}`} title="打开本地留存的面单 PDF 打印">打印面单</a>
                          )}
                        </>
                      )}
                      {canPush && !pushFailedRow && (
                        <form action={pushOrdersToOms} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <input type="hidden" name="orderNos" value={o.orderNo} />
                          {!o.phone && <input className="input" name="phone" placeholder="收件人电话(必填)" style={{ width: 150, height: 28 }} />}
                          <button className="btn btn-sm" type="submit">推送 OMS</button>
                        </form>
                      )}
                      {canPush && pushFailedRow && (
                        <form action={retryOmsPush} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <input type="hidden" name="orderNo" value={o.orderNo} />
                          {!o.phone && <input className="input" name="phone" placeholder="收件人电话(必填)" style={{ width: 150, height: 28 }} />}
                          <button className="btn btn-sm" type="submit">重试推送</button>
                        </form>
                      )}
                    </div>
                    {hasTrack && (
                      <details style={{ marginTop: 6 }}>
                        <summary className="dim" style={{ fontSize: 'var(--fs-micro)', cursor: 'pointer' }}>手工发货 / 承运商页面</summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                          <CarrierLink carrier={o.shipment?.carrier || ''} trackingNo={o.shipment?.trackingNo || ''} />
                          <form action={shipOrder} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <input type="hidden" name="orderNo" value={o.orderNo} />
                            <select className="select" name="carrier" style={{ width: 108, height: 28 }} defaultValue="yunexpress">
                              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input className="input" name="trackingNo" placeholder="追踪号" style={{ width: 120, height: 28 }} />
                            <button className="btn btn-sm" type="submit">改填单号</button>
                          </form>
                        </div>
                      </details>
                    )}
                    {!hasTrack && (
                      <details style={{ marginTop: 6 }}>
                        <summary className="dim" style={{ fontSize: 'var(--fs-micro)', cursor: 'pointer' }}>手工发货（OMS 故障兜底）</summary>
                        <form action={shipOrder} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          <input type="hidden" name="orderNo" value={o.orderNo} />
                          <select className="select" name="carrier" style={{ width: 108, height: 28 }} defaultValue="yunexpress">
                            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input className="input" name="trackingNo" placeholder="追踪号" style={{ width: 120, height: 28 }} />
                          <button className="btn btn-sm" type="submit">发货</button>
                        </form>
                      </details>
                    )}
                    <form action={deleteOrders} style={{ marginTop: 6 }}>
                      <input type="hidden" name="orderNos" value={o.orderNo} />
                      <ConfirmSubmit className="btn btn-sm btn-ghost" style={{ color: '#E5484D' }}
                        label="删除订单" message={`确认删除订单 ${o.orderNo}？删除后不可恢复！`} />
                    </form>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={9}><div className="empty">没有符合条件的订单</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(n => (
            <a key={n} className="btn btn-ghost btn-sm" href={`/orders?${base}${base ? '&' : ''}page=${n}`}>{n}</a>
          ))}
          {totalPages > 10 && <span className="dim" style={{ alignSelf: 'center' }}>… {totalPages}</span>}
        </div>
      )}

      <div className="a-card a-card-pad" style={{ marginTop: 20 }}>
        <span className="eyebrow">批量填物流单号（OMS 故障时手工兜底）</span>
        <p className="dim" style={{ margin: '8px 0 10px' }}>
          每行一条：<span className="mono">订单号,承运商,追踪号</span>（逗号分隔）。例如：
          <span className="mono"> KV-AB12CD,yunexpress,YT123456789CN</span>
        </p>
        <form action={batchShip}>
          <textarea className="input" name="csv" rows={4} placeholder={'KV-XXXXXX,yunexpress,YT000000001CN\nKV-YYYYY,4px,LP000000002SG'} />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>批量发货</button>
        </form>
      </div>
    </>
  );

  function baseWith(over: Record<string, string>): string {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s || '';
  }
}

function isCodRow(o: Ord): boolean {
  return o.paymentMethod === 'cod' || o.paymentStatus === 'cod';
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CarrierLink({ carrier, trackingNo }: { carrier: string; trackingNo: string }) {
  const href = /dhl/i.test(carrier) ? `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNo)}`
    : /fedex/i.test(carrier) ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNo)}`
    : /ups/i.test(carrier) ? `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNo)}`
    : `https://t.17track.net/en#nums=${encodeURIComponent(trackingNo)}`;
  return (
    <a className="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href={href}>承运商页面 ↗</a>
  );
}
