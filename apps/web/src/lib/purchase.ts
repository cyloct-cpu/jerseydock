/**
 * 统一成交确认服务（对齐《JerseyDock COD 订单与 Meta Pixel / CAPI 需求、修改及测试验收文档》§5.5/§4）
 * - Purchase 只由服务端经 CAPI 回传；浏览器端不再发 Purchase
 * - 回传条件：paymentStatus=paid ∧（COD 订单还需 fulfillmentStatus=delivered）
 *   · COD（货到付款）：签收 + 收款都确认才发（拒收/取消/在途/未收款一律不发）
 *   · 在线支付/转账：托管收银台确认收款（money captured）即发——款项已实际到账
 * - 幂等：订单 purchaseStatus 锁（pending/sent 不再触发）+ 确定性 event_id（Meta 48h 去重兜底），
 *   人工确认 / OMS 签收 / 对账 sweep 三条路径并发也最多回传一次
 * - 回传字段挂订单对象（经 db-store ext 列往返无损，无需改表）
 */
import { dbReadOrders, dbWriteOrders } from './db-store';
import { enqueueCapiEvent } from './capi';

type AnyOrder = Record<string, any>;

/** COD 判定：下单方式 cod，或历史订单仅 paymentStatus 标 cod */
export function isCodOrder(o: AnyOrder): boolean {
  return o.paymentMethod === 'cod' || o.paymentStatus === 'cod';
}

/** 是否满足回传条件（幂等锁 + 业务条件；不满足时为无害 no-op） */
function eligible(o: AnyOrder): boolean {
  const st = String(o.purchaseStatus || '');
  if (st === 'sent' || st === 'pending') return false;
  if (String(o.paymentStatus) !== 'paid') return false;
  if (isCodOrder(o) && String(o.fulfillmentStatus) !== 'delivered') return false;
  return true;
}

/** 入队 + 落幂等字段（先入队后写状态：写失败/进程中断时 sweep 重入队，队列按 eventId 去重不会重复发） */
function fire(o: AnyOrder): void {
  const cod = isCodOrder(o);
  const eventId = `${cod ? 'cod' : 'online'}-${o.orderNo}`;
  const items = Array.isArray(o.items) ? o.items : [];
  o.purchaseStatus = 'pending';
  o.purchaseEventId = eventId;
  enqueueCapiEvent({
    eventName: 'Purchase',
    eventId,
    orderNo: String(o.orderNo),
    value: Number(o.totalUsd) || 0,
    currency: 'USD',
    numItems: items.reduce((n: number, i: AnyOrder) => n + (Number(i?.qty) || 1), 0),
    contents: items.map((i: AnyOrder) => ({
      id: String(i?.handle ?? i?.title ?? ''),
      quantity: Number(i?.qty) || 1,
      ...(i?.priceUsd != null ? { item_price: Number(i.priceUsd) } : {}),
    })),
    email: typeof o.email === 'string' ? o.email : undefined,
    phone: typeof o.phone === 'string' ? o.phone : undefined,
    // 下单时存下的 _fbp（下单接口写进订单），链接浏览器会话用于归因
    fbp: typeof o.fbp === 'string' ? o.fbp : undefined,
  });
}

/** 单订单确认：后台人工确认收款 / 在线支付回调后调用；条件不满足为无害 no-op */
export function maybeSendPurchase(orderNo: string): boolean {
  const orders = dbReadOrders();
  const o = orders.find(x => String(x.orderNo).toUpperCase() === String(orderNo).toUpperCase());
  if (!o || !eligible(o)) return false;
  fire(o);
  dbWriteOrders(orders);
  return true;
}

/** 全量对账（worker 周期调用）：捞出所有满足条件但未回传的订单（覆盖人工/Webhook/乱序通知全场景） */
export function sweepPurchaseEvents(): number {
  const orders = dbReadOrders();
  let n = 0;
  for (const o of orders) {
    if (eligible(o)) {
      fire(o);
      n++;
    }
  }
  if (n) dbWriteOrders(orders);
  return n;
}
