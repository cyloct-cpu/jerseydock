import Link from 'next/link';
import { notFound } from 'next/navigation';
import { paths, readJson, readJsonl } from '@/lib/store';
import { buildCustomers, fmtUsd, type Contact, type Event, type Order } from '@/lib/metrics';
import { listUsers, can } from '@/lib/auth';
import { deleteFollowUp, requirePage, saveFollowUp } from '@/lib/actions';

export const dynamic = 'force-dynamic';

type FollowUp = {
  id: string;
  customerKey: string;
  email: string;
  status: string;
  nextAt: string | null;
  owner: string;
  note: string;
  history?: { time: string; operator?: string; owner?: string; action: string; result?: string; note: string }[];
  createdAt: string;
  updatedAt?: string;
};

type HistoryEntry = NonNullable<FollowUp['history']>[number];

const STATUS: [string, string, 'warn' | 'accent' | 'ok' | 'bad' | 'plain'][] = [
  ['pending', '待回访', 'warn'],
  ['contacted', '联系中', 'accent'],
  ['converted', '已转化', 'ok'],
  ['lost', '已流失', 'bad'],
  ['not_interested', '不感兴趣', 'plain'],
];
const STATUS_LABEL = new Map(STATUS.map(([s, l]) => [s, l]));

const PAYMENT_LABEL: Record<string, string> = {
  pending: '待支付', paid: '已支付', refunded: '已退款', cancelled: '已取消', cod: '货到付款', transfer: '转账待确认',
};

export default async function FollowUpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage('/customers/followup');

  const all = readJson<FollowUp[]>(paths.followups, []);
  const f = all.find(x => x.id === id);
  if (!f) notFound();

  const users = readJsonl<{ email: string; whatsapp?: string; name?: string }>(paths.users);
  const waByEmail = new Map(users.filter(u => u.whatsapp).map(u => [u.email.toLowerCase(), u.whatsapp!]));
  const wa = waByEmail.get((f.email || f.customerKey || '').toLowerCase());

  const customers = buildCustomers(
    readJsonl<Event>(paths.events),
    readJsonl<Order>(paths.orders),
    readJsonl<Contact>(paths.contacts),
    users,
  );
  const cc = customers.find(c => c.email === (f.email || '').toLowerCase() || c.key === f.customerKey);

  const owners = listUsers().filter(u => can({ role: u.role, permissions: u.permissions || [] }, 'followup.edit')).map(u => ({ id: u.id, name: u.name || u.email }));
  const history = [...(f.history || [])].reverse();
  const now = Date.now();
  const overdue = f.status === 'pending' && f.nextAt && new Date(f.nextAt).getTime() < now;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link className="link-more" href="/customers/followup">← 返回回访工作台</Link>
      </div>

      <div className="page-head" style={{ marginTop: 0 }}>
        <div>
          <span className="eyebrow">CRM · 回访详情</span>
          <h1 style={{ marginTop: 6, fontSize: 'clamp(22px,3vw,30px)', wordBreak: 'break-all' }}>
            {f.email || f.customerKey}
          </h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <span className={`badge ${f.status === 'converted' ? 'ok' : f.status === 'lost' ? 'bad' : f.status === 'pending' ? 'warn' : 'accent'}`}>
              {STATUS_LABEL.get(f.status) || f.status}
            </span>
            {overdue && <span className="badge bad">已逾期</span>}
            {f.owner && <span className="badge plain">负责人 {f.owner}</span>}
          </div>
        </div>
        {cc && (
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>{cc.orderCount} 单 · {fmtUsd(cc.ltvUsd)}</div>
            <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 2 }}>
              浏览 {cc.viewCount} · 加购 {cc.cartCount}
            </div>
          </div>
        )}
      </div>

      {/* 更新表单 */}
      <section className="panel panel-pad" style={{ marginBottom: 16 }}>
        <span className="eyebrow">更新回访</span>
        <form action={saveFollowUp} style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 520 }}>
          <input type="hidden" name="id" value={f.id} />
          <input type="hidden" name="customerKey" value={f.customerKey} />
          <input type="hidden" name="email" value={f.email} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>状态</label>
              <select className="select" name="status" defaultValue={f.status}>
                {STATUS.map(([sv, lv]) => <option key={sv} value={sv}>{lv}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>下次跟进时间</label>
              <input className="input" name="nextAt" type="datetime-local" defaultValue={f.nextAt ? toLocalInput(f.nextAt) : ''} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>负责人</label>
              <select className="input" name="owner" defaultValue={f.owner}>
                <option value="">未分配</option>
                {owners.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>更新备注</label>
              <input className="input" name="note" placeholder="更新备注" defaultValue={f.note} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>回访结果</label>
            <textarea className="input" name="result" rows={2} placeholder="本次联系结果（如：已联系客户确认尺码，客户表示满意）" />
          </div>
          <div>
            <button className="btn btn-sm" type="submit">保存</button>
            {f.history?.length ? <small className="dim" style={{ marginLeft: 10 }}>已更新 {f.history.length} 次</small> : null}
          </div>
        </form>
      </section>

      {/* 客户价值 */}
      {cc && (
        <section className="panel panel-pad" style={{ marginBottom: 16 }}>
          <span className="eyebrow">客户价值</span>
          <div className="kpi-grid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="a-card" style={{ border: '1px solid var(--line-2)', borderRadius: 3, padding: '8px 10px' }}>
              <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>订单数</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2, color: 'var(--text)' }}>{cc.orderCount}</div>
            </div>
            <div className="a-card" style={{ border: '1px solid var(--line-2)', borderRadius: 3, padding: '8px 10px' }}>
              <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>累计消费</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2, color: 'var(--text)' }}>{fmtUsd(cc.ltvUsd)}</div>
            </div>
            <div className="a-card" style={{ border: '1px solid var(--line-2)', borderRadius: 3, padding: '8px 10px' }}>
              <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>浏览商品</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2, color: 'var(--text)' }}>{cc.viewCount}</div>
            </div>
            <div className="a-card" style={{ border: '1px solid var(--line-2)', borderRadius: 3, padding: '8px 10px' }}>
              <div className="dim" style={{ fontSize: 'var(--fs-micro)' }}>加购次数</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 2, color: 'var(--text)' }}>{cc.cartCount}</div>
            </div>
          </div>
        </section>
      )}

      {/* WhatsApp 直达 */}
      {wa && (
        <div className="a-card a-card-pad" style={{ marginBottom: 16 }}>
          <span className="eyebrow">WhatsApp</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 'var(--fs-small)' }}>{wa}</span>
            <a href={'https://wa.me/' + wa.replace(/[^0-9]/g, '')} target="_blank" rel="noopener noreferrer" className="btn btn-sm" style={{ background: '#25D366', borderColor: '#25D366', color: '#fff' }}>
              打开 WhatsApp 对话 ↗
            </a>
          </div>
        </div>
      )}

      {/* 回访记录时间轴：四列表格 */}
      <section className="panel panel-pad" style={{ marginBottom: 16 }}>
        <span className="eyebrow">回访记录（{history.length} 条）</span>
        {history.length ? (
          <div className="a-table-wrap" style={{ border: 0, marginTop: 10 }}>
            <table className="a-table">
              <thead>
                <tr><th style={{ width: 150 }}>时间</th><th style={{ width: 90 }}>负责人</th><th style={{ width: 90 }}>操作人</th><th>回访结果 / 备注</th></tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="dim" style={{ whiteSpace: 'nowrap' }}>{new Date(h.time).toLocaleString('zh-CN', { hour12: false })}</td>
                    <td className="dim">{h.owner || '—'}</td>
                    <td className="dim">{h.operator || '—'}</td>
                    <td className="wrap">{h.result || h.note || (h.action === 'created' ? '创建回访' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-small)' }}>暂无回访记录。</p>
        )}
      </section>
    </>
  );
}


function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
