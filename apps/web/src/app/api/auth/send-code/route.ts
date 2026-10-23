import { NextRequest, NextResponse } from 'next/server';
import { issueCode } from '@/lib/verify-code';
import { sendMail, mailerMode } from '@/lib/mailer';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const USERS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'users.jsonl');

function emailRegistered(email: string): boolean {
  try {
    return fs.readFileSync(USERS_LOG, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as { email?: string }; } catch { return null; } })
      .some(u => u?.email?.toLowerCase() === email);
  } catch { return false; }
}

/**
 * POST /api/auth/send-code  { email, purpose: 'register' | 'password' }
 * 发送 6 位邮箱验证码（10 分钟有效）。
 * purpose=register：邮箱必须未注册；purpose=password：邮箱必须已注册。
 * dev 模式（未配置 SMTP）：验证码同时回显在响应里，便于本地联调；上线前配置 SMTP 后自动关闭回显。
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const purpose = body.purpose === 'password' ? 'password' : 'register';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: '邮箱格式不正确' }, { status: 400 });
  }

  if (purpose === 'register' && emailRegistered(email)) {
    return NextResponse.json({ ok: false, error: '该邮箱已注册，请直接登录' }, { status: 400 });
  }
  if (purpose === 'password' && !emailRegistered(email)) {
    return NextResponse.json({ ok: false, error: '该邮箱未注册' }, { status: 400 });
  }

  let code: string;
  try {
    code = issueCode(email, purpose);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '发送失败' }, { status: 429 });
  }

  try {
    const { mode } = await sendMail({
      to: email,
      subject: `JERSEYDOCK verification code: ${code}`,
      text: `Your JERSEYDOCK verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.`,
    });
    // dev 模式回显验证码（上线配置 SMTP 后自动关闭）
    return NextResponse.json({ ok: true, mode, ...(mode === 'dev' ? { devCode: code } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: '邮件发送失败，请稍后再试' }, { status: 500 });
  }
}
