import fs from 'node:fs';
import path from 'node:path';

/**
 * 邮箱验证码签发 / 校验（注册 register、改密 password 两个用途）
 * - 存储：data/verify-codes.jsonl（10 分钟有效，一次性使用）
 * - 限频：同一邮箱+用途 60 秒内只能重发一次；10 分钟内最多 5 条
 */

const CODES_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'verify-codes.jsonl');

type CodeRec = {
  email: string;
  purpose: 'register' | 'password';
  code: string;
  issuedAt: string;
  expiresAt: number;
  used?: boolean;
};

function readCodes(): CodeRec[] {
  try {
    return fs.readFileSync(CODES_PATH, 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as CodeRec; } catch { return null; } })
      .filter((x): x is CodeRec => x !== null);
  } catch { return []; }
}

function writeCodes(list: CodeRec[]): void {
  fs.mkdirSync(path.dirname(CODES_PATH), { recursive: true });
  // 只保留 30 分钟内的记录，文件不无限膨胀
  const cutoff = Date.now() - 30 * 60_000;
  fs.writeFileSync(CODES_PATH, list.filter(c => new Date(c.issuedAt).getTime() > cutoff).map(c => JSON.stringify(c)).join('\n') + (list.length ? '\n' : ''), 'utf8');
}

export function issueCode(email: string, purpose: 'register' | 'password'): string {
  const mail = email.trim().toLowerCase();
  const list = readCodes();
  const mine = list.filter(c => c.email === mail && c.purpose === purpose);

  // 限频
  const last = mine[mine.length - 1];
  if (last && Date.now() - new Date(last.issuedAt).getTime() < 60_000) {
    throw new Error('发送太频繁，请 1 分钟后再试');
  }
  if (mine.filter(c => Date.now() - new Date(c.issuedAt).getTime() < 10 * 60_000).length >= 5) {
    throw new Error('验证码发送次数已达上限，请 10 分钟后再试');
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  list.push({
    email: mail, purpose, code,
    issuedAt: new Date().toISOString(),
    expiresAt: Date.now() + 10 * 60_000,
  });
  writeCodes(list);
  return code;
}

export function verifyCode(email: string, purpose: 'register' | 'password', code: string): void {
  const mail = email.trim().toLowerCase();
  const list = readCodes();
  const rec = [...list].reverse().find(
    c => c.email === mail && c.purpose === purpose && !c.used,
  );
  if (!rec) throw new Error('请先获取验证码');
  if (Date.now() > rec.expiresAt) throw new Error('验证码已过期，请重新获取');
  if (rec.code !== String(code || '').trim()) throw new Error('验证码不正确');

  // 一次性使用
  rec.used = true;
  const idx = list.findIndex(c => c === rec);
  if (idx >= 0) { list[idx] = rec; writeCodes(list); }
}
