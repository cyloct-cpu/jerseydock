import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

const CONTACTS_LOG = path.resolve(process.cwd(), '..', '..', 'data', 'contacts.jsonl');

/**
 * 联系表单（需求 N9：是否留联系方式 → CRM hasContact）
 * 落盘 data/contacts.jsonl，供后台客户管理导入。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, orderNo, message } = body ?? {};
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 });
    }
    if (!message || String(message).trim().length < 5) {
      return NextResponse.json({ ok: false, error: 'Please write a short message' }, { status: 400 });
    }
    const record = {
      name: String(name || '').slice(0, 120),
      email: String(email).slice(0, 160),
      orderNo: orderNo ? String(orderNo).slice(0, 40) : '',
      message: String(message).slice(0, 4000),
      ts: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(CONTACTS_LOG), { recursive: true });
    fs.appendFileSync(CONTACTS_LOG, JSON.stringify(record) + '\n', 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Send failed' }, { status: 200 });
  }
}
