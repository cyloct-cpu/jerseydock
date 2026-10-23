import type { Metadata } from 'next';
import { getSessionUserFull, getUserAddresses } from '@/lib/users';
import { loadPaymentSettings } from '@/lib/payment';
import type { PaymentMode } from './CheckoutClient';
import CheckoutClient, { type SavedCheckoutInfo } from './CheckoutClient';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  // 登录用户：用账户资料 + 默认地址预填结算表单（未登录则不预填）
  const user = await getSessionUserFull();
  const saved: SavedCheckoutInfo = user
    ? {
        email: user.email,
        name: user.name || '',
        phone: user.phone,
        address: user.address,
        addresses: getUserAddresses(user),
      }
    : null;

  const settings = loadPaymentSettings();

  // 转账收款通道（万里汇 / XTransfer）：配置了收款信息才在前台展示
  const isTransfer = settings.provider === 'worldfirst' || settings.provider === 'xtransfer';
  const transfer = isTransfer
    ? {
        channel: settings.provider === 'worldfirst' ? '万里汇 WorldFirst' : 'XTransfer',
        ...(settings.provider === 'worldfirst' ? settings.worldfirst : settings.xtransfer),
      }
    : null;

  // 在线支付通道状态（后台配置了密钥才展示重定向收银台）；万里汇/XTransfer 为转账通道，收银台模式回落占位
  const paymentMode = (settings.provider === 'stripe' || settings.provider === 'paypal'
    ? settings.provider
    : 'placeholder') as PaymentMode;

  return <CheckoutClient saved={saved} paymentMode={paymentMode} signedIn={!!user} transfer={transfer} />;
}
