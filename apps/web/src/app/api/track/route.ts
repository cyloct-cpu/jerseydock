import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

const LOG = path.resolve(process.cwd(), '..', '..', 'data', 'events.logl');

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, body + '\n', 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
