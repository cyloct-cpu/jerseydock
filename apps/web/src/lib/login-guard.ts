/**
 * 登录失败锁定（内存版，重启即清零；单实例部署够用）
 * - 同一账号连续失败 5 次 → 锁定 15 分钟
 * - key 用「邮箱」即可（攻击者换 IP 不换邮箱照样锁；换邮箱撞库则由限流中间件兜底）
 */

type FailRec = { n: number; until: number };

const fails = new Map<string, FailRec>();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

/** 被锁定时返回剩余秒数；未锁定返回 0 */
export function loginLocked(key: string): number {
  const f = fails.get(key);
  if (!f || !f.until) return 0;
  if (f.until <= Date.now()) { fails.delete(key); return 0; }
  return Math.ceil((f.until - Date.now()) / 1000);
}

export function loginFail(key: string): void {
  const f = fails.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) {
    f.until = Date.now() + LOCK_MS;
    f.n = 0;
  }
  fails.set(key, f);
}

export function loginOk(key: string): void {
  fails.delete(key);
}
