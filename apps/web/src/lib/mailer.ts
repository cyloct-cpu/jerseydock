import fs from 'node:fs';
import path from 'node:path';

/**
 * 邮件发送（注册验证码 / 改密验证码 / 未来订单通知共用）
 * - 生产：配置 SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM 即发真邮件。
 *   走 Resend HTTP API（443 端口）而不是 SMTP —— 本服务器代理会拦截 465/587 的 SMTP 流量。
 *   SMTP_PASS 填 Resend API Key（re_ 开头），MAIL_FROM 必须是 Resend 已验证域名下的地址。
 * - 本地未配置：验证码写入 data/dev-mail.log 并打印控制台，本地可完整测试，无需上线
 *   ⚠️ 上线前务必配置 —— 未配置时 send-code 接口会把验证码回显在响应里（仅便于本地调试）
 */

const DEV_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'dev-mail.log');

export function mailerMode(): 'smtp' | 'dev' {
  return process.env.SMTP_HOST && process.env.SMTP_USER ? 'smtp' : 'dev';
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<{ mode: 'smtp' | 'dev' }> {
  if (mailerMode() === 'dev') {
    const line = `[${new Date().toISOString()}] TO: ${opts.to} | SUBJECT: ${opts.subject}\n${opts.text}\n${'-'.repeat(60)}\n`;
    try { fs.appendFileSync(DEV_LOG, line, 'utf8'); } catch { /* 忽略写盘失败 */ }
    console.log(`[dev-mail] → ${opts.to} | ${opts.subject}\n${opts.text}`);
    return { mode: 'dev' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SMTP_PASS}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'JERSEYDOCK <onboarding@resend.dev>',
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[mail] Resend API ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error('mail send failed');
  }
  return { mode: 'smtp' };
}
