import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';

/**
 * 站点安全中间件
 * 1) 图片防盗链：/assets/* 校验 Referer，外站引用返回 403（空 Referer 放行：直接打开 / App 内嵌）
 * 2) API 分级限流：敏感接口（下单 / 验证码 / 图片搜索）严格，其余常规
 * 3) 安全响应头
 */

// [路径正则, 窗口内上限, 窗口毫秒]——按首个命中的规则限流
const API_RULES: [RegExp, number, number][] = [
  [/^\/api\/auth\/send-code/, 5, 60_000],          // 邮件验证码：防轰炸
  [/^\/api\/search\/image/, 6, 60_000],            // 以图搜款：CLIP 推理开销大
  [/^\/api\/orders$/, 10, 60_000],                 // 下单：防垃圾订单
  [/^\/api\/payment\//, 10, 60_000],               // 支付会话创建
  [/^\/api\/mt\//, 60, 60_000],                    // 翻译代理：外部 API 配额有限
  [/^\/api\//, 120, 60_000],                       // 其余 API 常规限流
];

const BLOCKED_REFERERS = true; // 图片防盗链总开关

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) 图片防盗链
  if (BLOCKED_REFERERS && pathname.startsWith('/assets/')) {
    const referer = req.headers.get('referer');
    if (referer) {
      try {
        if (new URL(referer).host !== req.headers.get('host')) {
          return new NextResponse('Hotlinking not allowed', { status: 403 });
        }
      } catch { /* 非法 Referer 按无处理 */ }
    }
  }

  // 2) API 限流
  if (pathname.startsWith('/api/')) {
    const ip = clientIp(req.headers);
    for (const [re, limit, windowMs] of API_RULES) {
      if (re.test(pathname)) {
        if (!rateLimit(`${ip}#${re.source}`, limit, windowMs)) {
          return new NextResponse('Too Many Requests', {
            status: 429,
            headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        break; // 只按首条命中规则限流
      }
    }
  }

  // 3) 安全响应头
  const res = NextResponse.next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return res;
}

export const config = {
  // matcher 必须包含 /assets：public 图片由静态处理器在中间件之后返回，
  // 只有让中间件先跑，防盗链与限流才拦得住
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png).*)'],
};
