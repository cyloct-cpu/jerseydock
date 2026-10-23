/**
 * 支付 Provider（需求 N8）
 *
 * 主流接入形式：API + 托管收银台（hosted checkout / redirect）。
 * 商户在后台填入支付公司的 API 密钥即可启用，无需改代码：
 * - Stripe：服务端创建 Checkout Session，客户跳转 Stripe 托管页付款，
 *   结果经 Webhook（checkout.session.completed）回写订单。卡数据不经过本站（PCI SAQ-A）。
 * - PayPal：创建 Order（v2/checkout/orders），客户跳转 PayPal 授权页，
 *   回跳后 capture，Webhook 双保险。
 * - 未配置密钥时回退 PlaceholderProvider（下单即「待支付」，后台人工确认）。
 *
 * 注意：本模块只使用 fetch（浏览器/服务器通用）；
 * Webhook 签名验签依赖 node:crypto，放在 web 的 API 路由里实现，避免污染客户端包。
 */

export type PaymentIntent = {
  orderNo: string;
  amountUsd: number;
  currency: string;
  email: string;
  /** 站点 origin（如 https://shop.example.com），用于拼回跳地址；由服务端注入 */
  origin: string;
};

export type PaymentResult =
  | { status: 'unavailable'; message: string }
  | { status: 'redirect'; url: string }
  | { status: 'ok'; reference: string };

export interface PaymentProvider {
  readonly id: 'placeholder' | 'stripe' | 'paypal';
  readonly label: string;
  /** 是否可用（后台配置了密钥才为 true） */
  isEnabled(): boolean;
  createIntent(input: PaymentIntent): Promise<PaymentResult>;
}

// ---------------- 配置 ----------------

export type PaymentSettings = {
  /** 当前通道：placeholder=未接入（占位）；stripe / paypal=托管收银台；worldfirst / xtransfer=转账收款（人工确认） */
  provider: 'placeholder' | 'stripe' | 'paypal' | 'worldfirst' | 'xtransfer';
  stripe: {
    /** sk_live_... / sk_test_...（服务端创建会话用） */
    secretKey: string;
    /** pk_live_...（备用，如未来接入 Elements） */
    publishableKey: string;
    /** whsec_...（Webhook 验签） */
    webhookSecret: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    /** sandbox=沙箱环境；live=生产 */
    env: 'sandbox' | 'live';
    /** Webhook ID（PayPal 后台创建 Webhook 后获得，用于验签；可选） */
    webhookId: string;
  };
  /** 万里汇：转账收款（人工确认到账），收款信息展示给客户 */
  worldfirst: TransferAccount;
  /** XTransfer：转账收款（人工确认到账），收款信息展示给客户 */
  xtransfer: TransferAccount;
};

export type TransferAccount = {
  accountName: string;
  accountNumber: string;
  bankName: string;
  swiftCode: string;
  /** 转账说明（前台展示） */
  note: string;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  provider: 'placeholder',
  stripe: { secretKey: '', publishableKey: '', webhookSecret: '' },
  paypal: { clientId: '', clientSecret: '', env: 'sandbox', webhookId: '' },
  worldfirst: { accountName: '', accountNumber: '', bankName: '', swiftCode: '', note: '' },
  xtransfer: { accountName: '', accountNumber: '', bankName: '', swiftCode: '', note: '' },
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 宽松归一化：任何字段缺失都退回默认值，坏数据不会让前台白屏 */
export function normalizePayment(input: unknown): PaymentSettings {
  const p = (input ?? {}) as Partial<PaymentSettings>;
  const provider = ['stripe', 'paypal', 'worldfirst', 'xtransfer'].includes(String(p.provider))
    ? (p.provider as PaymentSettings['provider'])
    : 'placeholder';
  const stripe = p.stripe ?? ({} as PaymentSettings['stripe']);
  const paypal = p.paypal ?? ({} as PaymentSettings['paypal']);
  return {
    provider,
    stripe: {
      secretKey: str(stripe.secretKey),
      publishableKey: str(stripe.publishableKey),
      webhookSecret: str(stripe.webhookSecret),
    },
    paypal: {
      clientId: str(paypal.clientId),
      clientSecret: str(paypal.clientSecret),
      env: paypal.env === 'live' ? 'live' : 'sandbox',
      webhookId: str(paypal.webhookId),
    },
    worldfirst: normTransfer(p.worldfirst),
    xtransfer: normTransfer(p.xtransfer),
  };
}

function normTransfer(v: unknown): TransferAccount {
  const t = (v ?? {}) as Partial<TransferAccount>;
  return {
    accountName: str(t.accountName),
    accountNumber: str(t.accountNumber),
    bankName: str(t.bankName),
    swiftCode: str(t.swiftCode),
    note: str(t.note),
  };
}

// ---------------- 占位实现 ----------------

/** 占位实现：支付未开通，走人工核对线下收款 */
export class PlaceholderProvider implements PaymentProvider {
  readonly id = 'placeholder' as const;
  readonly label = 'Online payment — coming soon';
  isEnabled(): boolean {
    return true;
  }
  async createIntent(_input: PaymentIntent): Promise<PaymentResult> {
    return {
      status: 'unavailable',
      message:
        'Online payment is not enabled yet. Your order has been created as "awaiting payment" — ' +
        'our team will confirm payment manually.',
    };
  }
}

// ---------------- Stripe（Checkout 重定向） ----------------

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeProvider implements PaymentProvider {
  readonly id = 'stripe' as const;
  readonly label = 'Stripe · Cards & more';
  constructor(private cfg: PaymentSettings['stripe']) {}

  isEnabled(): boolean {
    // 至少需要 secretKey；webhookSecret 缺失时仅影响自动回写（回跳页仍可校验）
    return !!this.cfg.secretKey;
  }

  async createIntent(input: PaymentIntent): Promise<PaymentResult> {
    const origin = input.origin;
    const params = new URLSearchParams({
      mode: 'payment',
      customer_email: input.email,
      client_reference_id: input.orderNo,
      'line_items[0][quantity]': '1',
      'line_items[0][currency]': 'usd',
      'line_items[0][unit_amount]': String(Math.round(input.amountUsd * 100)),
      'line_items[0][price_data][product_data][name]': `Order ${input.orderNo}`,
      'metadata[order_no]': input.orderNo,
      success_url: `${origin}/checkout/return?orderNo=${encodeURIComponent(input.orderNo)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout?canceled=1&orderNo=${encodeURIComponent(input.orderNo)}`,
    });
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      return { status: 'unavailable', message: data?.error?.message || `Stripe error (${res.status})` };
    }
    return { status: 'redirect', url: data.url };
  }
}

// ---------------- PayPal（Orders v2 重定向 + 回跳 capture） ----------------

export class PayPalProvider implements PaymentProvider {
  readonly id = 'paypal' as const;
  readonly label = 'PayPal';
  constructor(private cfg: PaymentSettings['paypal']) {}

  private get base(): string {
    return this.cfg.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  isEnabled(): boolean {
    return !!this.cfg.clientId && !!this.cfg.clientSecret;
  }

  /** OAuth2 client_credentials 取 access token */
  private async token(): Promise<string> {
    const auth = btoa(`${this.cfg.clientId}:${this.cfg.clientSecret}`);
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.access_token) {
      throw new Error(data?.error_description || `PayPal auth error (${res.status})`);
    }
    return data.access_token as string;
  }

  async createIntent(input: PaymentIntent): Promise<PaymentResult> {
    const origin = input.origin;
    try {
      const token = await this.token();
      const res = await fetch(`${this.base}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: 'USD', value: input.amountUsd.toFixed(2) },
            custom_id: input.orderNo,
            invoice_id: input.orderNo,
          }],
          application_context: {
            return_url: `${origin}/checkout/return?orderNo=${encodeURIComponent(input.orderNo)}&token={ORDER_ID}`,
            cancel_url: `${origin}/checkout?canceled=1&orderNo=${encodeURIComponent(input.orderNo)}`,
            user_action: 'PAY_NOW',
          },
        }),
      });
      const data = await res.json().catch(() => null);
      const approve = data?.links?.find((l: { rel: string }) => l.rel === 'approve');
      if (!res.ok || !approve?.href) {
        return { status: 'unavailable', message: data?.message || `PayPal error (${res.status})` };
      }
      return { status: 'redirect', url: approve.href };
    } catch (err) {
      return { status: 'unavailable', message: err instanceof Error ? err.message : 'PayPal error' };
    }
  }

  /** 回跳落地页调用：capture 订单，返回是否已完成支付 */
  async capture(orderId: string): Promise<{ paid: boolean; reference?: string; error?: string }> {
    try {
      const token = await this.token();
      const res = await fetch(`${this.base}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status === 'COMPLETED') {
        const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
        return { paid: true, reference: capture?.id || orderId };
      }
      return { paid: false, error: data?.message || `Capture status: ${data?.status ?? res.status}` };
    } catch (err) {
      return { paid: false, error: err instanceof Error ? err.message : 'Capture failed' };
    }
  }
}

// ---------------- 工厂 ----------------

/** 按后台配置解析当前支付通道；密钥缺失自动回退占位 */
export function resolvePaymentProvider(settings: PaymentSettings | undefined): PaymentProvider {
  const s = settings ?? DEFAULT_PAYMENT_SETTINGS;
  if (s.provider === 'stripe' && s.stripe.secretKey) return new StripeProvider(s.stripe);
  if (s.provider === 'paypal' && s.paypal.clientId && s.paypal.clientSecret) return new PayPalProvider(s.paypal);
  return new PlaceholderProvider();
}

export const paymentProviders: PaymentProvider[] = [new PlaceholderProvider()];
/** @deprecated 保留兼容；请用 resolvePaymentProvider(loadPaymentSettings()) */
export const activePayment = (): PaymentProvider => paymentProviders[0];
