import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionEdge } from '@/lib/session';
import { can, readUserById } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/vision/models  { baseUrl, key }
 * 拉取 OpenAI 兼容聚合站的模型列表（GET {baseUrl}/models），
 * 并尽力标记哪些是视觉（图片输入）模型：有 metadata 用 metadata（如 OpenRouter 的
 * input_modalities），没有就按模型名特征判断。
 */

const VISION_NAME_RE = /(vl|vision|gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o3|gemini|claude-[34]|llama-4|glm-4v|pixtral|internvl|step-1v|doubao-vision|qvq|minicpm-v)/i;

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionEdge(token) : null;
  if (!session) return NextResponse.json({ ok: false, error: '登录已过期' }, { status: 401 });
  const user = readUserById(session.sub);
  if (!user || !can(user, 'settings.edit')) {
    return NextResponse.json({ ok: false, error: '无权操作' }, { status: 403 });
  }

  let body: { baseUrl?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '参数错误' }, { status: 400 });
  }

  const base = String(body.baseUrl || '').trim().replace(/\/+$/, '');
  const key = String(body.key || '').trim();
  if (!/^https?:\/\//.test(base)) {
    return NextResponse.json({ ok: false, error: '接口地址必须以 http(s):// 开头' }, { status: 400 });
  }
  if (!key) return NextResponse.json({ ok: false, error: '请先填写 API Key' }, { status: 400 });

  const url = /\/models$/.test(base) ? base : `${base}/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    const detail = e instanceof Error ? String((e.cause as { message?: string } | undefined)?.message || e.message) : '超时';
    return NextResponse.json({ ok: false, error: `无法连接接口：${detail}` }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json({ ok: false, error: `接口返回 ${res.status}：${detail.slice(0, 160)}` }, { status: 502 });
  }

  const j = await res.json().catch(() => null) as { data?: unknown[] } | unknown[] | null;
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
  const models = arr
    .map((m: any) => {
      const id = String(m?.id ?? m?.name ?? '').trim();
      if (!id) return null;
      // 有 modalities 元数据用元数据（OpenRouter），否则按名字特征猜
      const modal = m?.architecture?.input_modalities ?? m?.input_modalities ?? m?.modalities;
      const vision = Array.isArray(modal) ? modal.map(String).map(s => s.toLowerCase()).includes('image') : VISION_NAME_RE.test(id);
      return { id, vision };
    })
    .filter((m): m is { id: string; vision: boolean } => m !== null)
    .sort((a, b) => Number(b.vision) - Number(a.vision) || a.id.localeCompare(b.id));

  return NextResponse.json({ ok: true, total: models.length, visionCount: models.filter(m => m.vision).length, models });
}
