'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

type ShipmentEvent = { time: string; location?: string; description: string };

/**
 * 轨迹时间轴（前台）。
 * 事件文本以英文存储（OMS en_content / 17TRACK 英文）；客户语言非英语时，
 * 经 /api/i18n/mt 按需机翻并服务端永久缓存——同一轨迹文本全站只翻一次。
 */
export function TrackEvents({ events }: { events: ShipmentEvent[] | undefined }) {
  const { locale } = useStore();
  const [map, setMap] = useState<Record<string, string>>({});

  const list = (events || []).slice().reverse();
  const descList = Array.from(new Set(list.map(ev => ev.description).filter(Boolean)));

  useEffect(() => {
    if (locale === 'en' || !descList.length) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/i18n/mt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale, texts: descList }),
        });
        const j = await res.json();
        if (alive && j?.map && Object.keys(j.map).length) setMap(j.map);
      } catch { /* 翻译失败显示原文 */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, descList.join('\n')]);

  const tr = (s: string) => map[s] || s;

  return (
    <div className="timeline">
      {list.map((ev, i) => (
        <div className={`timeline-item${i === 0 ? ' active' : ''}`} key={i}>
          <span className="dot" />
          <div>
            <div className="t-time">{new Date(ev.time).toLocaleString('en-GB')}{ev.location ? ` · ${ev.location}` : ''}</div>
            <div className="t-desc">{tr(ev.description)}</div>
          </div>
        </div>
      ))}
      {(!events || !events.length) && (
        <p className="dim" style={{ marginTop: 10, fontSize: 'var(--fs-small)' }}>
          Tracking number assigned — detailed timeline updates shortly.
        </p>
      )}
    </div>
  );
}
