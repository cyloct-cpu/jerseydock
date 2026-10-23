import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS } from '@kitvault/shared';
import { translateContent, translateContentBatch } from '@/lib/mt';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mt/content — 商品内容按语言翻译（懒翻译 + 磁盘缓存）
 *   ?handle=<商品>&locale=zh   → { title, description }
 *   ?text=<原文>&locale=zh     → { text }（分类标题等零散文本，限长 300）
 * locale=en 直接原样返回；失败回落原文，不打断页面。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const locale = (sp.get('locale') || '').trim();
  const handle = (sp.get('handle') || '').trim();
  const text = (sp.get('text') || '').trim();
  if (!locale) return NextResponse.json({ ok: false, error: 'locale required' }, { status: 400 });

  try {
    if (handle) {
      const p = PRODUCTS.find(x => x.h === handle);
      if (!p) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
      const out = await translateContentBatch([p.t, p.d].filter(Boolean), locale);
      return NextResponse.json({
        ok: true,
        title: out[p.t] || p.t,
        description: p.d ? (out[p.d] || p.d) : '',
      });
    }

    if (text) {
      const src = text.slice(0, 300);
      return NextResponse.json({ ok: true, text: await translateContent(src, locale) });
    }

    return NextResponse.json({ ok: false, error: 'handle or text required' }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: 'translate failed' }, { status: 500 });
  }
}
