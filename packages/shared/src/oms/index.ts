/**
 * OMS（一件代发系统 / TWMS）API 客户端 —— 服务端专用，严禁在浏览器端引用。
 *
 * 对接文档：docs/oms-api参考.md（ShowDoc《一件代发系统API目录》整理稿）
 * 关键约定：
 *  - 全部 POST + JSON；每个请求体明文携带 customer_code / customer_pwd（无签名）
 *  - 统一响应 { Code, Msg, Data, Data2 }：Code 1=成功 0=失败 2=同参考单号已存在（按成功处理）
 *  - 面单 URL 服务端只保留 20 天，调用方必须下载落盘（见 admin lib/oms.ts）
 *  - 无回调/webhook，轨迹靠轮询 GetOrderTrack（≤100 单号/批）
 */

/** 订单的最小结构（orders.jsonl 实际为扁平字段；address 兼容历史对象格式） */
export type OrderLike = {
  orderNo: string;
  email: string;
  name?: string;
  phone?: string;
  address?: string | { line1?: string } | Record<string, unknown>;
  city?: string;
  country?: string;
  zip?: string;
  totalUsd: number;
  paymentMethod?: string;
  paymentStatus: string;
  items: { title?: string; handle?: string; priceUsd?: number; qty?: number; image?: string; customText?: string; armband?: string }[];
};

export const OMS_DEFAULT_BASE = 'http://oms.cfky888.com:7772';

export type OmsConfig = {
  enabled: boolean;
  customerCode: string;
  customerPwd: string;
  baseUrl: string;
  /** 发货仓库 id（7=深圳仓），下单必填 */
  defaultOgId: number;
  /** 默认渠道（getShippingMethod 的 service_code，如「日本佐川」） */
  defaultServiceCode: string;
  /** 单件默认预报重量 kg（商品无重量数据，按件数 × 此值估算） */
  defaultWeightKg: number;
  /** 「已签收超 N 天未回款」提醒阈值（天） */
  codRemindDays: number;
};

export const DEFAULT_OMS_CONFIG: OmsConfig = {
  enabled: false,
  customerCode: '',
  customerPwd: '',
  baseUrl: OMS_DEFAULT_BASE,
  defaultOgId: 7,
  defaultServiceCode: '',
  defaultWeightKg: 0.3,
  codRemindDays: 14,
};

export function normalizeOmsConfig(raw: unknown): OmsConfig {
  const r = (raw ?? {}) as Partial<Record<keyof OmsConfig, unknown>>;
  return {
    enabled: r.enabled === true,
    customerCode: String(r.customerCode ?? '').trim(),
    customerPwd: String(r.customerPwd ?? '').trim(),
    baseUrl: String(r.baseUrl ?? '').trim() || OMS_DEFAULT_BASE,
    defaultOgId: Number(r.defaultOgId) > 0 ? Number(r.defaultOgId) : 7,
    defaultServiceCode: String(r.defaultServiceCode ?? '').trim(),
    defaultWeightKg: Number(r.defaultWeightKg) > 0 ? Number(r.defaultWeightKg) : 0.3,
    codRemindDays: Number(r.codRemindDays) > 0 ? Number(r.codRemindDays) : 14,
  };
}

/* ---------------- 收货国家名 → ISO 二字码（下单 country_code 必填） ---------------- */

const COUNTRY_TO_ISO2: Record<string, string> = {
  'united states': 'US', usa: 'US', 'u.s.': 'US', 'america': 'US',
  'united kingdom': 'GB', uk: 'GB', england: 'GB', 'great britain': 'GB',
  germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT', netherlands: 'NL', holland: 'NL',
  portugal: 'PT', brazil: 'BR', mexico: 'MX', canada: 'CA', australia: 'AU', japan: 'JP',
  thailand: 'TH', taiwan: 'TW', 'hong kong': 'HK', 'china': 'CN',
  'south korea': 'KR', korea: 'KR', vietnam: 'VN', philippines: 'PH', malaysia: 'MY',
  singapore: 'SG', indonesia: 'ID', india: 'IN', russia: 'RU', ukraine: 'UA',
  poland: 'PL', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  ireland: 'IE', switzerland: 'CH', austria: 'AT', belgium: 'BE', greece: 'GR',
  'czech republic': 'CZ', czechia: 'CZ', hungary: 'HU', romania: 'RO', turkey: 'TR',
  israel: 'IL', 'saudi arabia': 'SA', 'united arab emirates': 'AE', uae: 'AE',
  qatar: 'QA', kuwait: 'KW', chile: 'CL', argentina: 'AR', colombia: 'CO', peru: 'PE',
  'new zealand': 'NZ', 'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', morocco: 'MA',
  'puerto rico': 'PR', 'dominican republic': 'DO', jamaica: 'JM', 'costa rica': 'CR',
  panama: 'PA', guam: 'GU', iceland: 'IS', luxembourg: 'LU', slovakia: 'SK',
  slovenia: 'SI', croatia: 'HR', bulgaria: 'BG', estonia: 'EE', latvia: 'LV',
  lithuania: 'LT', serbia: 'RS', georgia: 'GE', armenia: 'AM', kazakhstan: 'KZ',
  pakistan: 'PK', bangladesh: 'BD', 'sri lanka': 'LK', nepal: 'NP', cambodia: 'KH',
  laos: 'LA', myanmar: 'MM', mongolia: 'MN', jordan: 'JO', lebanon: 'LB',
  bahrain: 'BH', oman: 'OM', egypt: 'EG', ghana: 'GH', tunisia: 'TN',
};

/** 国家名（大小写不敏感）→ ISO2；无法识别返回 ''（调用方应报错而不是猜测） */
export function toCountryIso2(name: string): string {
  return COUNTRY_TO_ISO2[String(name ?? '').trim().toLowerCase()] || '';
}

/* ---------------- 统一请求 ---------------- */

export type OmsEnvelope<T = unknown> = {
  code: number;
  msg: string;
  data: T;
  data2?: string;
};

export async function callOms<T = unknown>(
  cfg: Pick<OmsConfig, 'baseUrl' | 'customerCode' | 'customerPwd'>,
  apiPath: string,
  body: Record<string, unknown>,
  timeoutMs = 20000
): Promise<OmsEnvelope<T>> {
  if (!cfg.customerCode || !cfg.customerPwd) {
    throw new Error('OMS 账号未配置（请在后台设置 → OMS 代发中填写 customer_code / customer_pwd）');
  }
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_code: cfg.customerCode, customer_pwd: cfg.customerPwd, ...body }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`OMS HTTP ${res.status}`);
    const j = (await res.json()) as { Code?: number; Msg?: string; Data?: T; Data2?: string };
    return { code: Number(j.Code ?? 0), msg: String(j.Msg ?? ''), data: (j.Data ?? j) as T, data2: j.Data2 };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('OMS 请求超时');
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 基础接口封装 ---------------- */

export type OmsShippingMethod = { service_id: number; service_code: string; service_name: string; lable_name?: string; is_lable?: string };
export type OmsWarehouse = { og_id: number; og_name: string; og_ename?: string; og_code?: string; og_city?: string; country?: string; status?: string };

export const omsGetShippingMethods = (cfg: OmsConfig) => callOms<OmsShippingMethod[]>(cfg, '/api/OMSAPI/getShippingMethod', {});
export const omsGetWarehouses = (cfg: OmsConfig) => callOms<OmsWarehouse[]>(cfg, '/api/OMSAPI/GetWarehouse', {});

export type OmsCreateResult = {
  order_id?: number;
  ref_number?: string;
  order_code?: string;
  order_number?: string;
  tracking_number?: string;
  shipping_method_no?: string;
  label?: string;
  label_status?: string;
  order_status?: string;
  label_url?: string;
  og_id?: number | string;
};

/** 创建直发订单（CreateLogisticsOrder）。Code 1=创建成功 2=同参考单号已存在（同样返回单号，按成功处理） */
export const omsCreateDirectOrder = (cfg: OmsConfig, payload: Record<string, unknown>) =>
  callOms<OmsCreateResult>(cfg, '/api/OMSAPI/CreateLogisticsOrder', payload);

/** 查询订单跟踪单号/面单（异步取号后补拉；number 传参考单号或订单号均可） */
export const omsGetTrackingNumber = (cfg: OmsConfig, number: string) =>
  callOms<Record<string, unknown>>(cfg, '/api/OMSAPI/GetTrackingNumber', { number });

/** 批量查轨迹（≤100 个单号，逗号分隔；参考号/运单号/跟踪号均可） */
export const omsGetOrderTrack = (cfg: OmsConfig, numbers: string[]) =>
  callOms<OmsTrackItem[]>(cfg, '/api/OMSAPI/GetOrderTrack', { number: numbers.join(',') });

export type OmsTrackItem = {
  no?: string;              // 参考单号（=我们的 KV- 订单号）
  number?: string;          // OMS 订单号
  oriNumber?: string;       // 跟踪单号
  destCountry?: string;
  inDate?: string;
  newTrack?: string;        // 最新中文轨迹状态（如「派送中」）
  newTrackDate?: string;
  newTrackLocation?: string;
  newTrackContext?: string;
  events?: { time?: string; location?: string; content?: string; en_content?: string }[];
};

/** 获取面单（CreateOrderLabel，按跟踪号，可批量合并） */
export const omsGetOrderLabel = (cfg: OmsConfig, trackingNumbers: string[]) =>
  callOms<Array<{ tracking_number: string; order_number: string; label: string; label_type?: string; ref_number?: string }>>(
    cfg, '/api/OMSAPI/CreateOrderLabel', { tracking_number: trackingNumbers.join(','), print_phd: 'false' }
  );

/** 作废订单（仅仓库未操作的订单可作废） */
export const omsCancelOrder = (cfg: OmsConfig, opts: { orderIds?: string; refNumber?: string }) =>
  callOms(cfg, '/api/OMSAPI/CancelOrder', {
    order_ids: opts.orderIds ?? '',
    ref_number: opts.refNumber ?? '',
    delete_type: opts.orderIds ? 'order_id' : 'ref_number',
  });

/** 拦截订单（未出库的订单） */
export const omsBlockOrder = (cfg: OmsConfig, orderIds: string) =>
  callOms(cfg, '/api/OMSAPI/BlockOrder', { order_ids: orderIds });

/* ---------------- 下单 payload 组装 ---------------- */

export type DirectOrderOverrides = { weightKg?: number; phone?: string; serviceCode?: string; ogId?: number; rmk?: string };

/**
 * KITVAULT 订单 → CreateLogisticsOrder 请求体。
 * reference_no 固定用 KV- 订单号（幂等键，重复提交 OMS 返回 Code 2 且照常给单号）。
 * COD：货到付款订单传 totalUsd（币种与服务商渠道约定为准，联调确认项），先付款订单传 0。
 */
export function buildDirectOrderPayload(order: OrderLike, cfg: OmsConfig, ov: DirectOrderOverrides = {}): Record<string, unknown> {
  const countryIso = toCountryIso2(String(order.country ?? ''));
  if (!countryIso) throw new Error(`无法识别目的地国家「${order.country}」，请用英文国家名（如 Japan / United States）`);

  const phone = String(ov.phone ?? order.phone ?? '').trim();
  if (!phone) throw new Error('收件人电话缺失（OMS 必填），请在推送时补填');

  const addr = typeof order.address === 'string'
    ? order.address
    : String((order.address as { line1?: string } | null)?.line1 ?? '');
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) throw new Error('订单没有商品行');
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
  const weightKg = Number(ov.weightKg ?? cfg.defaultWeightKg * totalQty) || cfg.defaultWeightKg;
  const isCod = order.paymentMethod === 'cod' || order.paymentStatus === 'cod';

  return {
    order_type: 'A',
    reference_no: order.orderNo,
    shipping_method: ov.serviceCode || cfg.defaultServiceCode,
    shipping_method_no: '',
    country_code: countryIso,
    order_weight: Math.round(weightKg * 100) / 100,
    platform: '自建站',
    shop: 'JERSEYDOCK',
    order_pieces: 1,
    og_id: String(ov.ogId ?? cfg.defaultOgId),
    rmk: ov.rmk ?? '',
    COD: isCod ? Number(order.totalUsd) || 0 : 0,
    label_title: 'JERSEYDOCK',
    order_source: 'JERSEYDOCK',
    print_phd: false,
    Consignee: {
      consignee_company: '',
      consignee_province: String(order.city ?? ''),
      consignee_city: String(order.city ?? ''),
      consignee_district: '',
      consignee_street: addr.slice(0, 200),
      consignee_street2: '',
      consignee_street3: '',
      consignee_postcode: String(order.zip ?? ''),
      consignee_name: String(order.name ?? order.email ?? '').slice(0, 60),
      consignee_telephone: phone,
      consignee_email: String(order.email ?? ''),
      consignee_certificatetype: '',
      consignee_certificatecode: '',
      consignee_credentials_period: '',
      buyer_id: '',
      consignee_doorplate: '',
      consignee_taxno: '',
    },
    ItemArr: items.map(it => ({
      invoice_enname: String(it.title ?? 'Jersey').slice(0, 100),
      invoice_cnname: '服装',
      invoice_weight: cfg.defaultWeightKg,
      invoice_quantity: Number(it.qty) || 1,
      invoice_unitcharge: Number(it.priceUsd) || 0,
      invoice_currencycode: 'USD',
      hs_code: '',
      invoice_note: [it.customText ? `custom:${it.customText}` : '', it.armband ? `patch:${it.armband}` : ''].filter(Boolean).join(' '),
      invoice_url: '',
      sku: String(it.handle ?? ''),
      image: String(it.image ?? ''),
    })),
  };
}

/* ---------------- 状态映射 ---------------- */

/** OMS 订单状态 → 中文（后台展示用） */
export const OMS_ORDER_STATUS_LABEL: Record<string, string> = {
  P: '已预报', B: '打包完成', I: '分拣中', S: '分拣完成', O: '已出库', R: '已核重', Y: '缺货', D: '作废',
};

/** OMS 中文轨迹状态 → 本站履约状态（只升级不降级由调用方保证） */
export function omsTrackToFulfillment(zhStatus: string): 'delivered' | 'exception' | 'in_transit' | 'shipped' {
  const s = String(zhStatus ?? '');
  if (/已签收/.test(s)) return 'delivered';
  if (/拒收|丢件|销毁|异常|退件|退回/.test(s)) return 'exception';
  if (/派送中|已上网|转运中|待取件|已出库|到达/.test(s)) return 'in_transit';
  return 'shipped';
}
