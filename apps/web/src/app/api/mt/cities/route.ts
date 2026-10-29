import { NextRequest, NextResponse } from 'next/server';
import { translateContentBatch } from '@/lib/mt';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mt/cities?locale=de&names=Munich,Hamburg
 * 城市建议名本地化：AutoComplete 城市选项（英文）按当前语言机翻，
 * 服务端 content-{locale}.json 永久缓存 — 同一城市名全站只翻一次。
 * locale=en 直接返回空映射（无需翻译）。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const locale = (sp.get('locale') || '').trim();
  const namesRaw = (sp.get('names') || '').trim();
  if (!locale || locale === 'en') return NextResponse.json({ ok: true, map: {} });
  if (!namesRaw) return NextResponse.json({ ok: true, map: {} });

  // 城市名不含逗号，用逗号串联传输；最多 80 个 / 每个限长 60
  const names = namesRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 80)
    .map(s => s.slice(0, 60));

  try {
    const map = await translateContentBatch(names, locale);
    return NextResponse.json({ ok: true, map: map || {} });
  } catch {
    return NextResponse.json({ ok: true, map: {} });
  }
}
