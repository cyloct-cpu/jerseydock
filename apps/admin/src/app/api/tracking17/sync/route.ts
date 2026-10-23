import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { paths, readJsonl, writeJsonl } from '@/lib/store';
import { requirePage } from '@/lib/actions';
import { getTracking17, hasApiKey } from '@/lib/tracking17';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tracking17/sync — 从 17TRACK API 批量拉取轨迹并写入订单的 shipment.events
 * 数据源：orders.jsonl 中所有有 shipment.trackingNo 的订单
 * 17TRACK API 会返回最新轨迹，系统自动解析为标准时间轴格式并保存
 */
export async function POST(req: NextRequest) {
  // 鉴权
  const cookie = req.headers.get('cookie') || '';
  if (!cookie.includes('kv_admin_session=')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasApiKey()) {
    return NextResponse.json({ ok: false, error: '17TRACK API Key 未配置，请在环境变量 TRACK17_API_KEY 或后台设置中填写' }, { status: 400 });
  }

  const ORDERS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'orders.jsonl');
  const orders = fs.readFileSync(ORDERS_LOG, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const { getTracking17 } = await import('@/lib/tracking17');
  const results = [];
  let synced = 0, skipped = 0, failed = 0;

  for (const o of orders) {
    const trackingNo = o.shipment?.trackingNo;
    if (!trackingNo) { skipped++; continue; }

    try {
      const result = await getTracking17(trackingNo, true); // force refresh
      if (!result) { failed++; results.push({ orderNo: o.orderNo, error: '未查到数据' }); continue; }

      // 将 17TRACK 的事件解析为标准时间轴格式
      const events = (result.events || []).map(ev => ({
        time: ev.time,
        location: ev.location || '',
        description: ev.description || '',
      }));

      // 更新 shipment
      o.shipment = {
        ...o.shipment,
        carrier: o.shipment?.carrier || 'other',
        trackingNo,
        status: result.status === 'Delivered' ? 'delivered' : result.status === 'Exception' ? 'exception' : 'in_transit',
        events,
      };
      o.updatedAt = new Date().toISOString();
      synced++;

      results.push({
        orderNo: o.orderNo,
        trackingNo,
        status: result.status,
        events: events.length,
        latest: events[events.length - 1]?.description || '',
      });
    } catch (e) {
      failed++;
      results.push({ orderNo: o.orderNo, trackingNo, error: String(e).slice(0, 100) });
    }
  }

  // 写回 orders.jsonl
  if (synced > 0) {
    fs.writeFileSync(ORDERS_LOG, orders.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');
  }

  return NextResponse.json({
    ok: true,
    synced,
    skipped,
    failed,
    results: results.slice(0, 10), // 只返回前 10 条预览
    total: orders.length,
  });
}
