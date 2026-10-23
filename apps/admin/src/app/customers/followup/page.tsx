import Link from 'next/link';
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
  history?: { time: string; operator?: string; action: string; result?: string; note: string }[];
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
const ACTIVE = new Set(['pending', 'contacted']);
const PER_PAGE = 30;

export default async function FollowUpPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  // requirePage 返回当前登录的管理员（用于权限过滤：非管理员只看自己负责的回访）
  const currentUser = await requirePage('/customers/followup');
  const sp = await searchParams;
  const tab = sp.tab || 'todo';
  const q = (sp.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(sp.page || 1));

  const isOwnerLevel = currentUser?.role === 'owner';

  const all = readJson<FollowUp[]>(paths.followups, []);
  const users = readJsonl<{ email: string; whatsapp?: string; name?: string }>(paths.users);
  const waByEmail = new Map(users.filter(u => u.whatsapp).map(u => [u.email.toLowerCase(), u.whatsapp!]));
  const owners = listUsers().filter(u => can({ role: u.role, permissions: u.permissions || [] }, 'followup.edit')).map(u => ({ id: u.id, name: u.name || u.email }));
  const customers = buildCustomers(
    readJsonl<Event>(paths.events),
    readJsonl<Order>(paths.orders),
    readJsonl<Contact>(paths.contacts),
    users,
  );
  const custByEmail = new Map(customers.map(c => [c.email.toLowerCase(), c]));
  const now = Date.now();
  const isOverdueRow = (f: FollowUp) => f.status === 'pending' && !!f.nextAt && new Date(f.nextAt).getTime() < now;
  const isTodayRow = (f: FollowUp) => {
    if (!['pending', 'contacted'].includes(f.status) || !f.nextAt) return false;
    const d = new Date(f.nextAt);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };

  const countBy = (s: string) => all.filter(f => f.status === s).length;
  const activeCount = all.filter(f => ACTIVE.has(f.status)).length;
  const overdueCount = all.filter(isOverdueRow).length;
  const todayCount = all.filter(isTodayRow).length;

  // 权限过滤：非 Owner 角色只看自己负责的回访
  let rows = all.filter(f => {
    if (!isOwnerLevel && f.owner !== (currentUser?.name || '')) return false;
    if (tab === 'todo') return ACTIVE.has(f.status);
    if (tab === 'overdue') return isOverdueRow(f);
    if (tab === 'today') return isTodayRow(f);
    if (tab === 'all') return true;
    return f.status === tab;
  });
  if (q) rows = rows.filter(f => [f.customerKey, f.email, f.owner, f.note].join(' ').toLowerCase().includes(q));

  const rank = (f: FollowUp) => {
    const t = f.nextAt ? new Date(f.nextAt).getTime() : Infinity;
    return t + (f.status === 'pending' && f.nextAt && t < now ? -1e15 : 0);
  };
  rows = rows.sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : (b.updatedAt || b.createdAt) < (a.updatedAt || a.createdAt) ? -1 : 1;
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const items = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const tabLink = (t: string, label: string, count: number | null, on: boolean) => (
    <Link key={t} href={`/customers/followup?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
      className="btn btn-ghost btn-sm" style={on ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
      {label}{count != null ? ` ${count}` : ''}
    </Link>
  );
  const overdueAll = all.filter(isOverdueRow).length;
  const todayAll = all.filter(isTodayRow).length;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CRM · Follow-up</span>
          <h1 style={{ marginTop: 6 }}>回访工作台</h1>
          <div className="sub">点击客户名进入回访详情；逾期优先排序；已转化 / 已流失 / 不感兴趣自动归档，可按 Tab 找回。</div>
        </div>
        <span className="dim">共 {all.length} 条 · 本视图 {total} 条</span>
      </div>

      {/* 待办摘要（点击筛选） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <Link href="/customers/followup?tab=todo" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="eyebrow">进行中待办</span>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{activeCount}</div>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>查看全部待办 →</span>
        </Link>
        <Link href="/customers/followup?tab=overdue" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none', outline: overdueCount ? '1px solid var(--bad, #E5484D)' : undefined }}>
          <span className="eyebrow">已逾期</span>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6, color: overdueCount ? 'var(--bad, #E5484D)' : 'var(--text)' }}>{overdueCount}</div>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>优先处理 →</span>
        </Link>
        <Link href="/customers/followup?tab=today" className="a-card a-card-pad" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="eyebrow">今日到期</span>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{todayCount}</div>
          <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>今日要联系的客户 →</span>
        </Link>
      </div>

      {/* 筛选 Tab + 搜索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {tabLink('todo', '待办', activeCount, tab === 'todo')}
        {tabLink('overdue', '已逾期', overdueAll, tab === 'overdue')}
        {tabLink('today', '今日到期', todayAll, tab === 'today')}
        {STATUS.map(([s, l]) => tabLink(s, l, countBy(s), tab === s))}
        {tabLink('all', '全部', all.length, tab === 'all')}
        <form method="get" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <input type="hidden" name="tab" value={tab} />
          <input className="input" name="q" defaultValue={q} placeholder="搜客户 / 负责人 / 备注" style={{ height: 30, width: 220 }} />
          <button className="btn btn-ghost btn-sm" type="submit">搜索</button>
        </form>
      </div>

      {/* 工作列表：精简行，点击进入详情页 */}
      <div className="a-card">
        {items.length ? (
          items.map(f => {
            const wa = waByEmail.get((f.email || f.customerKey || '').toLowerCase());
            const overdue = f.status === 'pending' && f.nextAt && new Date(f.nextAt).getTime() < now;
            const detailHref = `/customers/followup/${f.id}`;
            return (
              <div key={f.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Link href={detailHref} style={{ fontSize: 'var(--fs-small)', color: 'var(--text)', wordBreak: 'break-all', textDecoration: 'none', fontWeight: 500 }}>
                    {f.email || f.customerKey}
                  </Link>
                  <span className={`badge ${STATUS.find(([s]) => s === f.status)?.[2] || 'plain'}`}>{STATUS_LABEL.get(f.status) || f.status}</span>
                  {overdue && <span className="badge bad">已逾期</span>}
                  <span style={{ flex: 1 }} />
                  {wa && (
                    <span style={{ fontSize: 'var(--fs-micro)' }}>
                      <span className="badge ok" style={{ marginRight: 6 }}>WhatsApp</span>
                      <span className="mono">{wa}</span>
                      <a href={'https://wa.me/' + wa.replace(/[^0-9]/g, '')} target="_blank" rel="noopener noreferrer" className="link-more" style={{ marginLeft: 8 }}>打开对话 ↗</a>
                    </span>
                  )}
                  <Link className="btn btn-sm btn-ghost" href={detailHref}>详情 →</Link>
                </div>
                <div className="dim" style={{ fontSize: 'var(--fs-micro)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>下次 {f.nextAt ? new Date(f.nextAt).toLocaleString('zh-CN', { hour12: false }) : '未设置'}</span>
                  {f.owner && <span>负责人 {f.owner}</span>}
                  {(() => {
                    const cc = custByEmail.get((f.email || f.customerKey || '').toLowerCase());
                    if (!cc || !cc.orderCount) return null;
                    return <span style={{ color: 'var(--text-2)' }}>{cc.orderCount} 单 · {fmtUsd(cc.ltvUsd)}</span>;
                  })()}
                  {f.note && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '48ch' }}>{f.note}</span>}
                </div>
              </div>
            );
          })
        ) : (
          <div className="dim" style={{ padding: '48px 16px', textAlign: 'center', fontSize: 'var(--fs-small)' }}>
            没有待处理记录 — 到客户管理页把客户「加入回访」，或切换状态 Tab 查看已归档记录。
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
          {page > 1
            ? <Link className="btn btn-ghost btn-sm" href={`/customers/followup?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}&page=${page - 1}`}>上一页</Link>
            : <span />}
          <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          {page < totalPages
            ? <Link className="btn btn-ghost btn-sm" href={`/customers/followup?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}&page=${page + 1}`}>下一页</Link>
            : <span />}
        </div>
      )}
    </>
  );
}

function isOverdueRow(f: { status: string; nextAt: string | null }): boolean {
  return f.status === 'pending' && !!f.nextAt && new Date(f.nextAt).getTime() < Date.now();
}
function isTodayRow(f: { status: string; nextAt: string | null }): boolean {
  if (!['pending', 'contacted'].includes(f.status) || !f.nextAt) return false;
  const d = new Date(f.nextAt);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
