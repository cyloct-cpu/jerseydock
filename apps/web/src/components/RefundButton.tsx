'use client';

import { useState } from 'react';
import { RefundModal } from './RefundModal';

/** 服务端页面（订单详情等）用的退款入口：按钮 + 弹窗状态封装 */
export function RefundButton({ orderNo, whatsapp, supportEmail }: { orderNo: string; whatsapp: string; supportEmail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Request a refund
      </button>
      <RefundModal open={open} onClose={() => setOpen(false)} orderNo={orderNo} whatsapp={whatsapp} supportEmail={supportEmail} />
    </>
  );
}
