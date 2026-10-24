/**
 * 统一「款项状态」模型（订单管理页筛选 / 徽章 / 归因 / CSV 导出共用）。
 * 由 支付方式 + paymentStatus + 履约状态 + OMS 轨迹状态 + 回款标记 推导，订单数据无需迁移。
 * COD 两阶段事实：签收/拒收来自轨迹（自动），回款到账来自服务商结算（人工标记 codConfirmedAt）。
 */
import type { AnyOrder } from './oms';

export type MoneyTone = 'ok' | 'warn' | 'bad' | 'accent' | 'dim';

export type MoneyState = {
  key: MoneyKey;
  label: string;
  tone: MoneyTone;
  /** 行内原因说明（为什么没付款 / 钱在哪一步） */
  reason?: string;
  /** 已签收且超过回款提醒阈值 */
  overdue?: boolean;
};

export type MoneyKey =
  | 'pending_online' | 'transfer_waiting' | 'prepaid' | 'refunded'
  | 'cod_pending' | 'cod_push_failed' | 'cod_transit' | 'cod_signed'
  | 'cod_refused' | 'cod_exception' | 'collected';

export const MONEY_LABEL: Record<MoneyKey, string> = {
  pending_online: '待支付',
  transfer_waiting: '转账待确认',
  prepaid: '已预付',
  refunded: '已退款',
  cod_pending: '货到付款·待推送',
  cod_push_failed: '推送失败',
  cod_transit: '代收在途',
  cod_signed: '已签收·待回款',
  cod_refused: '拒收·未收款',
  cod_exception: '异常·未收款',
  collected: '已回款',
};

export const MONEY_TONE: Record<MoneyKey, MoneyTone> = {
  pending_online: 'bad',
  transfer_waiting: 'warn',
  prepaid: 'ok',
  refunded: 'dim',
  cod_pending: 'dim',
  cod_push_failed: 'bad',
  cod_transit: 'accent',
  cod_signed: 'warn',
  cod_refused: 'bad',
  cod_exception: 'bad',
  collected: 'ok',
};

/** 快捷筛选 chips：key → 包含的款项状态 */
export const MONEY_CHIPS: { key: string; label: string; states: MoneyKey[] }[] = [
  { key: 'pending', label: '待处理', states: ['pending_online', 'transfer_waiting', 'cod_pending', 'cod_push_failed'] },
  { key: 'cod_transit', label: '代收在途', states: ['cod_transit'] },
  { key: 'cod_signed', label: '待回款', states: ['cod_signed'] },
  { key: 'risk', label: '未收款风险', states: ['cod_refused', 'cod_exception'] },
  { key: 'collected', label: '已收款', states: ['prepaid', 'collected'] },
  { key: 'refunded', label: '已退款', states: ['refunded'] },
];

function daysSince(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0;
}

function fmtDay(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
}

/** 推导订单款项状态（见 docs/oms-订单管理页设计.md §1 判定规则表） */
export function moneyStateOf(o: AnyOrder, codRemindDays = 14): MoneyState {
  const method = String(o.paymentMethod ?? (o.paymentStatus === 'cod' ? 'cod' : 'online'));
  const st = String(o.paymentStatus ?? 'pending');
  const ful = String(o.fulfillmentStatus ?? 'unfulfilled');
  const isCod = method === 'cod' || st === 'cod';

  if (st === 'refunded') return { key: 'refunded', label: MONEY_LABEL.refunded, tone: 'dim' };

  if (isCod) {
    if (o.codConfirmedAt) {
      return { key: 'collected', label: MONEY_LABEL.collected, tone: 'ok', reason: `${fmtDay(o.codConfirmedAt)} 已确认回款` };
    }
    if (o.oms?.pushError) {
      return { key: 'cod_push_failed', label: MONEY_LABEL.cod_push_failed, tone: 'bad', reason: o.oms.pushError };
    }
    if (ful === 'exception') {
      const zh = String(o.oms?.lastTrackStatus ?? '');
      if (/拒收|退回|退件/.test(zh)) {
        return { key: 'cod_refused', label: MONEY_LABEL.cod_refused, tone: 'bad', reason: `客户拒收${zh ? `（${zh}）` : ''}，包裹退回中，款项未收` };
      }
      if (/丢件|销毁/.test(zh)) {
        return { key: 'cod_exception', label: MONEY_LABEL.cod_exception, tone: 'bad', reason: `包裹${zh || '异常'}，款项未收，需向服务商索赔` };
      }
      return { key: 'cod_exception', label: MONEY_LABEL.cod_exception, tone: 'bad', reason: zh ? `派送异常（${zh}），未妥投未收款` : '派送异常，未妥投未收款，需联系客户或服务商' };
    }
    if (ful === 'delivered') {
      const d = daysSince(o.deliveredAt || o.oms?.lastTrackAt);
      if (d > codRemindDays) {
        return { key: 'cod_signed', label: MONEY_LABEL.cod_signed, tone: 'warn', overdue: true, reason: `${fmtDay(o.deliveredAt)} 已签收超 ${d} 天未回款，建议与服务商对账` };
      }
      return { key: 'cod_signed', label: MONEY_LABEL.cod_signed, tone: 'warn', reason: o.deliveredAt ? `${fmtDay(o.deliveredAt)} 已签收，代收款在服务商结算周期内` : '已签收，等待服务商回款' };
    }
    if (ful === 'shipped' || ful === 'in_transit') {
      return { key: 'cod_transit', label: MONEY_LABEL.cod_transit, tone: 'accent', reason: o.oms?.lastTrackStatus ? `最新：${o.oms.lastTrackStatus}` : '包裹运输中，货款由快递员代收' };
    }
    return { key: 'cod_pending', label: MONEY_LABEL.cod_pending, tone: 'dim', reason: '已下单，等待推送服务商' };
  }

  if (method === 'transfer') {
    if (st === 'paid') return { key: 'prepaid', label: MONEY_LABEL.prepaid, tone: 'ok' };
    return { key: 'transfer_waiting', label: MONEY_LABEL.transfer_waiting, tone: 'warn', reason: '客户选择银行转账，等待确认到账' };
  }

  // online
  if (st === 'paid') return { key: 'prepaid', label: MONEY_LABEL.prepaid, tone: 'ok' };
  if (st === 'failed') return { key: 'pending_online', label: MONEY_LABEL.pending_online, tone: 'bad', reason: '线上支付失败，客户未完成付款' };
  return { key: 'pending_online', label: MONEY_LABEL.pending_online, tone: 'bad', reason: '客户下单后一直未完成线上支付' };
}

/** 支付方式显示名 */
export function payMethodLabel(o: AnyOrder): string {
  const m = String(o.paymentMethod ?? (o.paymentStatus === 'cod' ? 'cod' : 'online'));
  return m === 'cod' ? '货到付款' : m === 'transfer' ? '银行转账' : '在线支付';
}
