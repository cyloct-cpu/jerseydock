import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS, type SlimProduct } from '@kitvault/shared';

export const dynamic = 'force-dynamic';

export type SearchHit = { h: string; t: string; v: string; p: number };

/**
 * 头部文本搜索：GET /api/search?q=
 * 标题 + 分类子串匹配（不分大小写），按销量排序取前 8。
 * 数据在内存（PRODUCTS），3.7k 条扫描开销可忽略。
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ ok: true, items: [] as SearchHit[] });

  const scored: { p: SlimProduct; score: number }[] = [];
  for (const p of PRODUCTS) {
    const title = p.t.toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (p.cl.some(c => c.includes(q.replace(/\s+/g, '-')))) score = 40;
    if (score > 0) scored.push({ p, score: score + p.sa / 1000 });
  }
  scored.sort((a, b) => b.score - a.score);

  const items: SearchHit[] = scored.slice(0, 8).map(({ p }) => ({ h: p.h, t: p.t, v: p.v, p: p.p }));
  return NextResponse.json({ ok: true, items });
}
