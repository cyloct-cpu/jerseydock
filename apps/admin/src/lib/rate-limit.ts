/**
 * 内存滑动窗口限流（单实例部署够用；多实例需换 Redis 等集中存储）
 * Edge Runtime 兼容：只用 Map 与 Date，无 Node API。
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/**
 * 尝试放行：窗口内未超限返回 true（并记一次），超限返回 false。
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // 低频清理：防止 Map 无限膨胀
  if (now - lastSweep > 300_000) {
    lastSweep = now;
    for (const [k, b] of buckets) {
      const last = b.hits[b.hits.length - 1];
      if (last === undefined || now - last > 3_600_000) buckets.delete(k);
    }
  }

  const b = buckets.get(key) || { hits: [] };
  b.hits = b.hits.filter(t => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  return true;
}

/** 从请求头提取客户端 IP（部署在反代后时取 x-forwarded-for 首段） */
export function clientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'local'
  );
}
