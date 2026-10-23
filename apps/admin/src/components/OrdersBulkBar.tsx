'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteOrders, pushOrdersToOms, setCodCollectedBulk } from '@/lib/actions';

const FORM_ID = 'orders-bulk-delete';

/**
 * 订单批量操作条：全选本页 + 已选计数 + 批量推送 OMS / 批量标记回款 / 批量删除。
 * 行内复选框通过 form 属性关联到删除表单；推送/回款按钮用 JS 把勾选单号同步到各自表单的隐藏域。
 */
export function OrdersBulkBar() {
  const [count, setCount] = useState(0);
  const pushForm = useRef<HTMLFormElement>(null);
  const collectForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="orderNos"][form="${FORM_ID}"]`));
    const update = () => setCount(boxes().filter(b => b.checked).length);
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset?.checkAll) {
        const on = t.checked;
        boxes().forEach(b => { b.checked = on; });
      }
      if (t.name === 'orderNos' || t.dataset?.checkAll) update();
    };
    document.addEventListener('change', onChange);
    update();
    return () => document.removeEventListener('change', onChange);
  }, []);

  const checkedNos = () =>
    Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="orderNos"][form="${FORM_ID}"]`))
      .filter(b => b.checked)
      .map(b => b.value)
      .join(',');

  const submitWith = (form: React.RefObject<HTMLFormElement | null>) => {
    const input = form.current?.querySelector<HTMLInputElement>('input[name="orderNos"]');
    if (input && checkedNos()) {
      input.value = checkedNos();
      form.current?.requestSubmit();
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 0 10px', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-2)', fontSize: 'var(--fs-small)' }}>
          <input type="checkbox" data-check-all="1" />
          全选本页
        </label>
        <span className="dim" style={{ fontSize: 'var(--fs-small)' }}>已选 {count} 单</span>
        <button className="btn btn-sm" type="button" disabled={count === 0} onClick={() => submitWith(pushForm)}
          style={count === 0 ? { opacity: 0.45 } : undefined}>
          批量推送 OMS
        </button>
        <button className="btn btn-sm" type="button" disabled={count === 0} onClick={() => submitWith(collectForm)}
          style={count === 0 ? { opacity: 0.45 } : { borderColor: 'var(--ok, #46A758)', color: 'var(--ok, #46A758)' }}>
          批量标记回款
        </button>
        <button className="btn btn-sm" type="submit" form={FORM_ID} disabled={count === 0}
          style={count === 0 ? { opacity: 0.45 } : { background: '#E5484D', borderColor: '#E5484D', color: '#fff' }}>
          删除选中订单
        </button>
        <span className="dim" style={{ fontSize: 'var(--fs-micro)' }}>删除不可恢复，操作会记入审计日志</span>
      </div>

      {/* 隐藏表单：勾选单号由 JS 同步进隐藏域后提交 */}
      <form ref={pushForm} action={pushOrdersToOms} style={{ display: 'none' }}>
        <input type="hidden" name="orderNos" value="" />
      </form>
      <form ref={collectForm} action={setCodCollectedBulk} style={{ display: 'none' }}>
        <input type="hidden" name="orderNos" value="" />
      </form>
      <form id={FORM_ID} action={deleteOrders} style={{ display: 'none' }} />
    </>
  );
}

/** 带浏览器确认框的提交按钮（删除等危险操作用） */
export function ConfirmSubmit({ label, message, className, style, disabled }: {
  label: string; message: string; className?: string; style?: React.CSSProperties; disabled?: boolean;
}) {
  return (
    <button type="submit" className={className} style={style} disabled={disabled}
      onClick={e => { if (!window.confirm(message)) e.preventDefault(); }}>
      {label}
    </button>
  );
}
