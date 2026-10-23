import { paths, readJson } from '@/lib/store';
import { saveSettings, saveOmsSettings, requirePage } from '@/lib/actions';
import { normalizePayment, normalizeOmsConfig } from '@kitvault/shared';
import { readRefCache } from '@/lib/oms';
import { ColorField } from '@/components/ColorField';
import { ReviewsEditor } from '@/components/ReviewsEditor';
import { CustomizeEditor, type CustomizeValue } from '@/components/CustomizeEditor';
import { HeroSlidesEditor, type HeroValue } from '@/components/HeroSlidesEditor';
import { SupportQrField } from '@/components/SupportQrField';
import { ToggleField } from '@/components/ToggleField';
import { PhoneInput } from '@/components/PhoneInput';
import { PaymentCard } from '@/components/PaymentCard';
import { OmsRefreshButton } from '@/components/OmsRefreshButton';

type Review = {
  id: string;
  name: string;
  location: string;
  rating: number;
  content: string;
  date: string;
  avatar: string;
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePage('/settings');
  const sp = await searchParams;
  const settings = readJson<{
    brand: { name: string; domain: string; adminDomain: string; supportEmail: string; whatsapp: string };
    announcement: string;
    announcementBar?: { enabled?: boolean; items?: string[]; color?: string; bg?: string; fontSize?: number };
    reviews?: { enabled?: boolean; title?: string; subtitle?: string; reviews?: unknown[] };
    visitors?: { enabled?: boolean; baseCount?: number; windowMinutes?: number; padToBase?: boolean };
    customize?: Partial<CustomizeValue>;
    hero?: Partial<HeroValue>;
    payment?: unknown;
    visionApi?: { keys?: string };
    paymentPlaceholder: string;
    oms?: unknown;
  }>(paths.settings, {
    brand: { name: 'JERSEYDOCK', domain: 'STORE_DOMAIN', adminDomain: 'ADMIN_DOMAIN', supportEmail: 'support@STORE_DOMAIN', whatsapp: '' },
    announcement: '',
    paymentPlaceholder: 'Online payment — coming soon',
  });

  const bar = settings.announcementBar ?? {};
  const barItems = bar.items?.length ? bar.items : [];
  const barEnabled = bar.enabled !== false;
  const barColor = bar.color || '';
  const barBg = bar.bg || '';
  const barFontSize = typeof bar.fontSize === 'number' ? bar.fontSize : 12;

  const reviewsCfg = settings.reviews ?? {};
  const reviewList = Array.isArray(reviewsCfg.reviews) ? (reviewsCfg.reviews as Review[]) : [];
  const visitorsCfg = settings.visitors ?? {};
  const supportQr = (settings.brand && (settings.brand as Record<string, any>).supportQr) || '';

  const omsCfg = normalizeOmsConfig(settings.oms);
  const channelCache = readRefCache<{ service_id: number }>('channels');
  const warehouseCache = readRefCache<{ og_id: number }>('warehouses');
  const channelCount = channelCache?.items?.length ?? null;
  const warehouseCount = warehouseCache?.items?.length ?? null;

  // 商品定制（前台详情页姓名烫印 / 袖章补丁），缺省值与前台 lib/brand.ts 保持一致
  const c = settings.customize ?? {};
  const customizeValue: CustomizeValue = {
    enabled: c.enabled !== false,
    nameNumber: {
      enabled: c.nameNumber?.enabled !== false,
      price: typeof c.nameNumber?.price === 'number' ? c.nameNumber.price : 3,
      maxLength: typeof c.nameNumber?.maxLength === 'number' ? c.nameNumber.maxLength : 24,
      placeholder: c.nameNumber?.placeholder || 'Ronaldo#7',
    },
    armband: {
      enabled: c.armband?.enabled !== false,
      options: Array.isArray(c.armband?.options)
        ? c.armband!.options.map(o => ({
            label: String(o?.label ?? ''),
            price: typeof o?.price === 'number' ? o.price : 3,
            image: String(o?.image ?? ''),
          }))
        : [
            { label: 'World Cup badge', price: 3, image: '/assets/customize/badge-worldcup.png' },
            { label: 'Continental badge', price: 3, image: '/assets/customize/badge-champions.png' },
            { label: 'Other league patch', price: 3, image: '/assets/customize/badge-league.png' },
          ],
    },
  };

  // Hero 轮播（前台首页），缺省值与前台 lib/brand.ts 保持一致
  const heroCfg = settings.hero ?? {};
  const heroValue: HeroValue = {
    enabled: heroCfg.enabled !== false,
    intervalMs: typeof heroCfg.intervalMs === 'number' ? heroCfg.intervalMs : 7000,
    slides: Array.isArray(heroCfg.slides) && heroCfg.slides.length
      ? heroCfg.slides.map((s: any, i: number) => ({
          id: String(s?.id ?? `hero_${i}`),
          image: String(s?.image ?? ''),
          eyebrow: String(s?.eyebrow ?? ''),
          title: String(s?.title ?? ''),
          subtitle: String(s?.subtitle ?? ''),
          ctaText: String(s?.ctaText ?? ''),
          ctaHref: String(s?.ctaHref ?? ''),
          cta2Text: String(s?.cta2Text ?? ''),
          cta2Href: String(s?.cta2Href ?? ''),
        }))
      : [
          {
            id: 'hero_default_1',
            image: '/assets/hero/hero-main.jpg',
            eyebrow: '26 / 27 season — now live',
            title: 'Wear the game.',
            subtitle: 'Club and national team jerseys from every major league — fan, player and kids versions, shipped worldwide.',
            ctaText: 'Shop the new season',
            ctaHref: '/collections/2026-27-season',
            cta2Text: 'Browse retro',
            cta2Href: '/collections/retro',
          },
          {
            id: 'hero_default_2',
            image: '/assets/hero/hero-alt.jpg',
            eyebrow: 'From the archive',
            title: 'Kits that made history.',
            subtitle: 'Hand-picked retro shirts from the seasons you remember — sourced, checked and shipped with care.',
            ctaText: 'Browse retro',
            ctaHref: '/collections/retro',
            cta2Text: 'New season',
            cta2Href: '/collections/2026-27-season',
          },
        ],
  };

  return (
    <>
      {sp.error && <div className="notice bad">{sp.error}</div>}

      <div className="page-head">
        <div>
          <span className="eyebrow">System</span>
          <h1 style={{ marginTop: 6 }}>商店设置</h1>
          <div className="sub">品牌与域名占位（N7）· 支付占位开关（N8）· 保存后写入 data/admin/settings.json，前台即时生效</div>
        </div>
      </div>

      {/* 品牌信息：全宽顶部主卡（表单网格在宽容器里自然分成多列） */}
      <form action={saveSettings} className="a-card a-card-pad" id="settings-form" style={{ marginBottom: 16 }}>
        <span className="eyebrow">品牌信息</span>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>品牌名（页头 / 页脚 / 邮件）</label>
            <input className="input" name="brandName" defaultValue={settings.brand.name} />
          </div>
          <div className="field">
            <label>前台域名</label>
            <input className="input" name="domain" defaultValue={settings.brand.domain} placeholder="example.com" />
          </div>
          <div className="field">
            <label>后台域名（独立部署）</label>
            <input className="input" name="adminDomain" defaultValue={settings.brand.adminDomain} placeholder="admin.example.com" />
          </div>
          <div className="field">
            <label>客服邮箱</label>
            <input className="input" name="supportEmail" defaultValue={settings.brand.supportEmail} />
          </div>
          <div className="field">
            <label>WhatsApp（可选）</label>
            <PhoneInput name="whatsapp" defaultValue={settings.brand.whatsapp} ariaLabel="WhatsApp" />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit">保存设置</button>
        </div>
      </form>

      {/* 其余设置卡：CSS 多列自动均衡两栏（增删卡片无需手动调配平衡） */}
      <div className="settings-cols">
          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">联系客服</span>
            <div style={{ marginTop: 12 }}>
              <label className="field" style={{ display: 'block', marginBottom: 0 }}>
                <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-2)' }}>客服二维码（前台悬浮按钮展示）</span>
                <SupportQrField value={supportQr} />
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存设置</button>
            </div>
          </form>

          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">顶部滚动公告条</span>
            <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <input type="checkbox" name="barEnabled" defaultChecked={barEnabled} style={{ accentColor: 'var(--accent)' }} />
                在前台启用（关闭后整条隐藏）
              </label>

              <div className="field">
                <label>滚动文案（每行一条，会依次横向滚动）</label>
                <textarea
                  className="input"
                  name="barItems"
                  rows={4}
                  defaultValue={barItems.join('\n')}
                  placeholder={'FREE SHIPPING ON 3+ ITEMS\nWORLDWIDE DELIVERY 7–15 DAYS\n30-DAY RETURNS'}
                />
                <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>
                  留空则使用默认三条（随语言切换）。第一行会以主题高亮色显示。
                </span>
              </div>

              <div className="field">
                <label>字号（px）</label>
                <input className="input" name="barFontSize" type="number" min="9" max="28" step="1" defaultValue={barFontSize} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <ColorField name="barColor" label="文字颜色" value={barColor} fallback="#C8A24A" placeholder="#C8A24A 或留空用主题色" />
                <ColorField name="barBg" label="背景颜色" value={barBg} fallback="#0A0A0B" placeholder="#0A0A0B 或留空" />
              </div>

              <div
                style={{
                  border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden',
                  background: barBg || 'var(--bg)', color: barColor || 'var(--accent)',
                }}
              >
                <div style={{ display: 'flex', gap: 20, padding: '9px 16px', fontSize: barFontSize, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {(barItems.length ? barItems : ['FREE SHIPPING ON 3+ ITEMS', 'WORLDWIDE DELIVERY 7–15 DAYS', '30-DAY RETURNS']).map((t, i) => (
                    <span key={i} style={{ color: i === 0 ? (barColor || 'var(--accent)') : (barColor ? barColor : 'var(--text-3)') }}>{t}</span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>预览（前台实际为无缝横向滚动，鼠标悬停暂停）</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存公告条</button>
            </div>
          </form>

          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">客户评价（运营自定义）</span>
            <div style={{ marginTop: 14 }}>
              <ReviewsEditor
                initial={reviewList}
                initialEnabled={reviewsCfg.enabled !== false}
                initialTitle={reviewsCfg.title || 'What our customers say'}
                initialSubtitle={reviewsCfg.subtitle || ''}
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存评价</button>
            </div>
          </form>

          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">实时访客数</span>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: visitorsCfg.enabled !== false ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer' }}>
                <ToggleField name="visitorsEnabled" defaultOn={visitorsCfg.enabled !== false} label="在商品列表与详情页显示访客数" />
                在商品列表与详情页显示访客数
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="field">
                  <label>基准人数</label>
                  <input className="input" name="visitorsBase" type="number" min="0" max="999" defaultValue={typeof visitorsCfg.baseCount === 'number' ? visitorsCfg.baseCount : 12} />
                </div>
                <div className="field">
                  <label>统计窗口（分钟）</label>
                  <input className="input" name="visitorsWindow" type="number" min="1" max="60" defaultValue={typeof visitorsCfg.windowMinutes === 'number' ? visitorsCfg.windowMinutes : 5} />
                </div>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <ToggleField name="visitorsPad" defaultOn={visitorsCfg.padToBase !== false} label="真实人数不足时补足到基准值" />
                真实人数不足时补足到基准值
              </label>

              <div className="notice" style={{ marginBottom: 0, fontSize: 'var(--fs-micro)', lineHeight: 1.8 }}>
                <b>统计方式</b>：记录每位访客最近的活动时间，统计「统计窗口」内活跃的去重人数，是真实数据。<br />
                <b>补足规则</b>：开启后，真实人数低于「基准人数」时前台显示为 <span className="mono">基准值+</span>（如 <span className="mono">12+</span>）；关闭则只显示真实值，无人时显示 0。<br />
                <b>关于展示</b>：<span className="dim">前台只显示数字，不会出现「演示 / 模拟 / 含演示数据」等字样——这类说明仅在此处向你展示，不对访客公开。</span>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存访客设置</button>
            </div>
          </form>

          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">首页 Hero 轮播</span>
            <div style={{ marginTop: 14 }}>
              <HeroSlidesEditor initial={heroValue} />
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存 Hero 轮播</button>
            </div>
          </form>

          <form action={saveSettings} className="a-card a-card-pad">
            <span className="eyebrow">商品定制（详情页）</span>
            <div style={{ marginTop: 14 }}>
              <CustomizeEditor initial={customizeValue} />
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="submit">保存定制设置</button>
            </div>
          </form>

          <PaymentCard initial={normalizePayment(settings.payment)} placeholderText={settings.paymentPlaceholder} />

          <form action={saveOmsSettings} className="a-card a-card-pad">
            <span className="eyebrow">OMS 代发 · 物流服务商绑定</span>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-small)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <ToggleField name="omsEnabled" defaultOn={omsCfg.enabled} label="启用 OMS 代发（支付/下单后自动推送订单、回传单号与轨迹）" />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div className="field">
                  <label>customer_code（客户代码）</label>
                  <input className="input" name="omsCustomerCode" defaultValue={omsCfg.customerCode} placeholder="如 SZ00010" />
                </div>
                <div className="field">
                  <label>customer_pwd（密码）</label>
                  <input className="input" name="omsCustomerPwd" type="password" defaultValue={omsCfg.customerPwd} placeholder="留空则保持原值" />
                </div>
                <div className="field">
                  <label>接口地址</label>
                  <input className="input" name="omsBaseUrl" defaultValue={omsCfg.baseUrl} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                <div className="field">
                  <label>默认发货仓 og_id</label>
                  <input className="input" name="omsOgId" type="number" min="1" defaultValue={omsCfg.defaultOgId} />
                </div>
                <div className="field">
                  <label>默认渠道 service_code</label>
                  <input className="input" name="omsServiceCode" defaultValue={omsCfg.defaultServiceCode} placeholder="如 日本佐川 / 泰国KERRY" />
                </div>
                <div className="field">
                  <label>单件默认重量（kg）</label>
                  <input className="input" name="omsWeightKg" type="number" step="0.01" min="0.01" defaultValue={omsCfg.defaultWeightKg} />
                </div>
                <div className="field">
                  <label>签收超 N 天未回款提醒</label>
                  <input className="input" name="omsCodRemindDays" type="number" min="1" defaultValue={omsCfg.codRemindDays} />
                </div>
              </div>

              <div className="notice" style={{ marginBottom: 0, fontSize: 'var(--fs-micro)', lineHeight: 1.8 }}>
                <b>工作方式</b>：启用后，货到付款订单下单即自动推送服务商（在线/转账订单在确认收款后推送）；
                推送成功实时拿回快递单号并自动下载面单；轨迹每 30 分钟自动同步，订单页可手动「同步 OMS 轨迹」。<br />
                <b>渠道 / 仓库</b>： og_id 与 service_code 以服务商返回为准——填好账号后点下方按钮拉取最新列表核对。
                {channelCount != null && <> 当前缓存：渠道 <b>{channelCount}</b> 个{warehouseCount != null ? <> · 仓库 <b>{warehouseCount}</b> 个</> : ''}。</>}<br />
                <b>安全</b>：账号密码仅存服务端 settings.json，不出前端、不打日志。
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn" type="submit">保存 OMS 配置</button>
              </div>
              <OmsRefreshButton />
            </div>
          </form>

          <div className="a-card a-card-pad">
            <span className="eyebrow">以图搜款 · 视觉 API（可选）</span>
            <div className="field" style={{ marginTop: 12 }}>
              <label>API Keys（每行一个，格式：类型:密钥）</label>
              <textarea
                className="input"
                name="visionKeys"
                rows={4}
                form="settings-form"
                defaultValue={settings.visionApi?.keys || ''}
                placeholder={'groq:gsk_…\nopenrouter:sk-or-…\nhuggingface:hf_…'}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-micro)' }}
              />
            </div>
            <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
              以图搜款主通道为本地 CLIP 模型（无需配置）。此处为<b>兜底通道</b>：当主通道匹配置信度不足时，
              调用视觉大模型提取「球队 / 赛季 / 颜色 / 款式」再走文本检索。支持 Groq / OpenRouter / HuggingFace 三家免费额度，
              按顺序轮换、失败自动冷却 10 分钟；留空则仅用主通道。
            </p>
          </div>

          <div className="a-card a-card-pad">
            <span className="eyebrow">数据与导出</span>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <a className="btn btn-ghost btn-sm" href="/api/export?type=orders">导出订单 CSV</a>
              <a className="btn btn-ghost btn-sm" href="/api/export?type=customers">导出客户 CSV</a>
              <a className="btn btn-ghost btn-sm" href="/api/export?type=events">导出埋点 CSV</a>
            </div>
            <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-micro)' }}>导出文件同时写入 data/exports/ 目录留存。</p>
          </div>

          <div className="a-card a-card-pad">
            <span className="eyebrow">说明</span>
            <ul className="dim" style={{ marginTop: 10, paddingLeft: 18, fontSize: 'var(--fs-micro)', lineHeight: 1.9 }}>
              <li>开发期数据落在 <span className="mono">data/</span> 目录（orders.jsonl / events.logl / admin/*.json）</li>
              <li>接入 PostgreSQL 后，后台读写切换为 Prisma Client（packages/db 已含完整 schema）</li>
              <li>品牌默认值在 <span className="mono">packages/shared/src/config/brand.ts</span>，本页保存后覆盖</li>
              <li>Logo 替换：<span className="mono">&lt;BrandLogo /&gt;</span> 组件（源码含 BRAND LOGO 注释）</li>
            </ul>
          </div>
      </div>
    </>
  );
}
