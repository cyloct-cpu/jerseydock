import fs from 'node:fs';
import path from 'node:path';

/**
 * 17TRACK API v2.2 客户端（自动拉取物流轨迹，替代手工维护时间轴）
 * - API Key 在 17track.net 开发者中心获取
 * - 免费额度有限；付费后按量计费，支持 Webhook 推送
 * - 本地缓存 data/tracking17-{trackingNo}.json 防止重复拉取
 */

const SETTINGS = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json');
const CACHE_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'tracking17');

export interface Track17Event {
  time: string;
  location: string;
  description: string;
}

export interface Track17Result {
  number: string;
  carrier: string;
  status: string;       // Delivered / In Transit / Exception / Expired / InfoReceived
  subStatus?: string;
  events: Track17Event[];
  latestEvent?: Track17Event;
  originCountry?: string;
  destinationCountry?: string;
}

function apiKey(): string {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    return s?.tracking17?.apiKey || process.env.TRACK17_API_KEY || '';
  } catch { return process.env.TRACK17_API_KEY || ''; }
}

export function hasApiKey(): boolean {
  return Boolean(apiKey());
}

function cacheFile(trackingNo: string): string {
  const safe = trackingNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

/** 读取缓存（有效期 30 分钟） */
function readCache(trackingNo: string): Track17Result | null {
  try {
    const f = cacheFile(trackingNo);
    if (!fs.existsSync(f)) return null;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - new Date(d.fetchedAt).getTime() > 30 * 60_000) return null;
    return d.result;
  } catch { return null; }
}

function saveCache(trackingNo: string, result: Track17Result): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(trackingNo), JSON.stringify({ fetchedAt: new Date().toISOString(), result }));
  } catch { /* 忽略 */ }
}

/** 调用 17TRACK API 获取轨迹信息 */
async function fetchTrack17(trackingNos: string[]): Promise<Track17Result[]> {
  const key = apiKey();
  if (!key) throw new Error('未配置 17TRACK API Key');
  const res = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
    method: 'POST',
    headers: {
      '17track-api-token': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(trackingNos.map(n => ({ number: n }))),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '17TRACK API error');
  const results: Track17Result[] = [];
  for (const item of json.data?.accept || []) {
    const events: Track17Event[] = (item.track_info?.events || []).map((ev: any) => ({
      time: ev.time_iso || ev.time || '',
      location: ev.location || '',
      description: ev.description || '',
    }));
    // timeline 按时间正序（API 返回倒序）
    events.reverse();
    results.push({
      number: item.number || '',
      carrier: item.carrier || '',
      status: item.track_info?.shipping_status || '',
      subStatus: item.track_info?.sub_status || '',
      events,
      latestEvent: events[events.length - 1],
      originCountry: item.track_info?.origin_info?.country_name || '',
      destinationCountry: item.track_info?.destination_info?.country_name || '',
    });
  }
  return results;
}

/** 获取单个运单号的轨迹（带缓存；强制刷新时绕过缓存重新拉取） */
export async function getTracking17(trackingNo: string, force = false): Promise<Track17Result | null> {
  if (!force) {
    const cached = readCache(trackingNo);
    if (cached) return cached;
  }
  try {
    const results = await fetchTrack17([trackingNo]);
    const r = results[0];
    if (r) saveCache(trackingNo, r);
    return r || null;
  } catch {
    // 拉取失败：尝试返回过期缓存
    try {
      const f = cacheFile(trackingNo);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).result;
    } catch { /* 忽略 */ }
    return null;
  }
}
