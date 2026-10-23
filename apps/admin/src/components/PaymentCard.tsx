'use client';

import { useState } from 'react';
import { normalizePayment, type PaymentSettings } from '@kitvault/shared';

/** 密钥输入框：掩码显示 + 显示/隐藏切换，支持预填值与归属表单 */
function SecretInput({
  name, label, defaultValue, placeholder, form, hint,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  form: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          name={name}
          type={show ? 'text' : 'password'}
          defaultValue={defaultValue}
          placeholder={placeholder}
          form={form}
          autoComplete="off"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShow(s => !s)}
          style={{ flex: '0 0 auto', minWidth: 52 }}
        >
          {show ? '隐藏' : '显示'}
        </button>
      </div>
      {hint && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{hint}</span>}
    </div>
  );
}

/**
 * 在线支付配置卡（后台「商店设置」）
 * - 通道下拉：未接入（占位）/ Stripe / PayPal
 * - 填入对应 API 密钥保存后即时生效：前台结算页「在线支付」跳转托管收银台，
 *   支付成功经 Webhook / 回跳落地页自动把订单标记为已付款
 * - 所有字段归属主设置表单（form=settings-form），随「保存设置」一起持久化
 */
export function PaymentCard({
  initial,
  placeholderText,
}: {
  initial: PaymentSettings;
  placeholderText: string;
}) {
  const [cfg, setCfg] = useState<PaymentSettings>(() => normalizePayment(initial));
  const provider = cfg.provider;

  return (
    <div className="a-card a-card-pad">
      <span className="eyebrow">在线支付</span>

      <div className="field" style={{ marginTop: 12 }}>
        <label>支付通道</label>
        <select
          className="select"
          name="paymentProvider"
          form="settings-form"
          value={provider}
          onChange={e => {
            const v = e.currentTarget.value;
            setCfg(c => ({ ...c, provider: v as PaymentSettings['provider'] }));
          }}
        >
          <option value="placeholder">未接入（占位：下单后人工确认收款）</option>
          <option value="stripe">Stripe — 信用卡等，托管收银台</option>
          <option value="paypal">PayPal — 托管收银台</option>
          <option value="worldfirst">万里汇 WorldFirst — 转账收款，人工确认</option>
          <option value="xtransfer">XTransfer — 转账收款，人工确认</option>
        </select>
      </div>

      {provider === 'stripe' && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <SecretInput
            name="stripeSecretKey"
            label="Secret Key（sk_live_…）"
            hint="服务端创建 Checkout Session 用；测试环境可用 sk_test_…"
            defaultValue={cfg.stripe.secretKey}
            placeholder="sk_live_…"
            form="settings-form"
          />
          <SecretInput
            name="stripePublishableKey"
            label="Publishable Key（pk_live_…，备用）"
            defaultValue={cfg.stripe.publishableKey}
            placeholder="pk_live_…"
            form="settings-form"
          />
          <SecretInput
            name="stripeWebhookSecret"
            label="Webhook Secret（whsec_…）"
            hint="支付结果验签；未配置时回跳落地页仍可核对，但建议配置"
            defaultValue={cfg.stripe.webhookSecret}
            placeholder="whsec_…"
            form="settings-form"
          />
          <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
            Webhook 地址：<code>https://&lt;你的域名&gt;/api/payment/webhook/stripe</code>，
            监听事件 <code>checkout.session.completed</code>。
          </p>
        </div>
      )}

      {provider === 'paypal' && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <SecretInput
            name="paypalClientId"
            label="Client ID"
            defaultValue={cfg.paypal.clientId}
            placeholder="A…"
            form="settings-form"
          />
          <SecretInput
            name="paypalClientSecret"
            label="Client Secret"
            defaultValue={cfg.paypal.clientSecret}
            placeholder="E…"
            form="settings-form"
          />
          <div className="field">
            <label>环境</label>
            <select className="select" name="paypalEnv" form="settings-form" defaultValue={cfg.paypal.env}>
              <option value="sandbox">Sandbox（沙箱测试）</option>
              <option value="live">Live（生产）</option>
            </select>
          </div>
          <SecretInput
            name="paypalWebhookId"
            label="Webhook ID（可选）"
            hint="PayPal 后台创建 Webhook 后获得，用于官方验签；未配置则按事件内容处理"
            defaultValue={cfg.paypal.webhookId}
            placeholder="1AB23456CD789012E"
            form="settings-form"
          />
          <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
            Webhook 地址：<code>https://&lt;你的域名&gt;/api/payment/webhook/paypal</code>，
            监听事件 <code>PAYMENT.SALE.COMPLETED</code>。
          </p>
        </div>
      )}

      {(provider === 'worldfirst' || provider === 'xtransfer') && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <p className="dim" style={{ fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
            {provider === 'worldfirst' ? '万里汇（WorldFirst）' : 'XTransfer'} 是跨境收款/结汇账户，不提供托管收银台。
            工作方式：把下方收款信息展示给客户，客户按信息转账（银行转账 / PingPong 等），到账后在「订单管理」人工标记已付款。
            API 级自动对账需企业资质开通（developers.worldfirst.com / xtransfer.com），暂不接入。
          </p>
          <div className="field">
            <label>收款人姓名（拼音/英文）</label>
            <input className="input" name="wfAccountName" defaultValue={provider === 'worldfirst' ? cfg.worldfirst.accountName : cfg.xtransfer.accountName} form="settings-form" placeholder="ZHANG SAN" />
          </div>
          <div className="field">
            <label>收款账号 / IBAN</label>
            <input className="input" name="wfAccountNumber" defaultValue={provider === 'worldfirst' ? cfg.worldfirst.accountNumber : cfg.xtransfer.accountNumber} form="settings-form" placeholder="1234 5678 9012" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="field">
            <label>开户行 / 收款平台</label>
            <input className="input" name="wfBankName" defaultValue={provider === 'worldfirst' ? cfg.worldfirst.bankName : cfg.xtransfer.bankName} form="settings-form" placeholder="WorldFirst (Ant Bank) / Citi Bank NY" />
          </div>
          <div className="field">
            <label>SWIFT / Routing（可选）</label>
            <input className="input" name="wfSwift" defaultValue={provider === 'worldfirst' ? cfg.worldfirst.swiftCode : cfg.xtransfer.swiftCode} form="settings-form" placeholder="CITIUS33" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="field">
            <label>转账说明（前台展示给客户）</label>
            <input className="input" name="wfNote" defaultValue={provider === 'worldfirst' ? cfg.worldfirst.note : cfg.xtransfer.note} form="settings-form" placeholder="下单后 48 小时内完成转账，到账后 24 小时内发货" />
          </div>
        </div>
      )}

      {provider === 'placeholder' && (
        <div className="field" style={{ marginTop: 12 }}>
          <label>支付区提示文案（前台结算页展示）</label>
          <input className="input" name="paymentPlaceholder" defaultValue={placeholderText} form="settings-form" />
        </div>
      )}

      <p className="dim" style={{ marginTop: 12, fontSize: 'var(--fs-micro)', lineHeight: 1.7 }}>
        填入密钥并保存后即时生效：前台结算页选择「在线支付」将跳转对应托管收银台（卡号等敏感信息不经由本站），
        付款成功后订单自动标记已支付；未接入时保持占位方案（下单即「待支付」，后台人工确认收款）。
      </p>
    </div>
  );
}
