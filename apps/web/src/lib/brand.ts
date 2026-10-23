import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '@kitvault/shared';

/**
 * 品牌信息（需求 N7：品牌/域名占位，后台 /settings 可在线修改）
 * 默认值来自 packages/shared/src/config/brand.ts；
 * 后台保存后写入 data/admin/settings.json，前台读取覆盖。
 */

const SETTINGS_PATH = path.resolve(process.cwd(), '..', '..', 'data', 'admin', 'settings.json');

export type AnnouncementBar = {
  /** 是否启用顶部滚动条 */
  enabled: boolean;
  /** 滚动文案，每条一项；留空则用 i18n 默认三条 */
  items: string[];
  /** 文字颜色（CSS 色值），空则用主题色 */
  color: string;
  /** 背景色（CSS 色值），空则用页面底色 */
  bg: string;
  /** 字号 px，0 或非法则用默认 12 */
  fontSize: number;
};

export type Review = {
  id: string;
  /** 客户显示名 */
  name: string;
  /** 地区，如「Manchester, UK」 */
  location: string;
  /** 1–5 星 */
  rating: number;
  content: string;
  /** 展示日期 YYYY-MM-DD */
  date: string;
  /** 头像图片 URL（可空，空则用姓名首字母） */
  avatar: string;
};

export type ReviewsConfig = {
  enabled: boolean;
  title: string;
  subtitle: string;
  reviews: Review[];
};

export type VisitorsConfig = {
  /** 商品页/商品卡是否显示实时访客数 */
  enabled: boolean;
  /** 基准人数：真实活跃数不足时补足到此值 */
  baseCount: number;
  /** 统计窗口（分钟）：该窗口内活跃的访客计为在线 */
  windowMinutes: number;
  /** 是否用基准值补足真实人数 */
  padToBase: boolean;
};

export type BrandSettings = {
  name: string;
  domain: string;
  adminDomain: string;
  supportEmail: string;
  whatsapp: string;
  /** 客服二维码图片 URL（后台上传；空则用 WhatsApp 链接生成） */
  supportQr: string;
  announcement: string;
  announcementBar: AnnouncementBar;
  reviews: ReviewsConfig;
  visitors: VisitorsConfig;
  customize: CustomizeConfig;
  hero: HeroConfig;
};

/** Hero 轮播单张 slide（图片 + 文案 + 双 CTA，后台可配） */
export type HeroSlide = {
  id: string;
  /** 图片 URL（/assets/... 或外链） */
  image: string;
  /** 小标签（可选） */
  eyebrow: string;
  /** 主标题 */
  title: string;
  /** 副文（可选） */
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  /** 第二链接（可选，文字链样式） */
  cta2Text: string;
  cta2Href: string;
};

export type HeroConfig = {
  enabled: boolean;
  /** 自动轮播间隔（毫秒），3000–15000 */
  intervalMs: number;
  slides: HeroSlide[];
};

const BAR_DEFAULTS: AnnouncementBar = {
  enabled: true,
  items: [],
  color: '',
  bg: '',
  fontSize: 14,
};

const REVIEWS_DEFAULTS: ReviewsConfig = {
  enabled: true,
  title: 'What our customers say',
  subtitle: '',
  reviews: [],
};

/**
 * 默认演示评价：后台未配置任何评价时回退展示（运营配置位，非真实买家留评）。
 * 后台一旦保存自己的评价，即完全替换这批默认值。
 */
const DEFAULT_REVIEWS: Review[] = [
  {
    id: 'rv_default_1',
    name: 'Daniel R.',
    location: 'Manchester, UK',
    rating: 5,
    content: 'Ordered the home shirt in a player version — the stitching and crest detail are a clear step above what I expected at this price. Arrived in nine days, well packaged.',
    date: '',
    avatar: '',
  },
  {
    id: 'rv_default_2',
    name: 'Lucas M.',
    location: 'São Paulo, BR',
    rating: 5,
    content: 'Second order from here. The size guide was accurate and the kids kit fits perfectly. Shipping updates came by email at every step, which I appreciated.',
    date: '',
    avatar: '',
  },
  {
    id: 'rv_default_3',
    name: 'Aiko T.',
    location: 'Tokyo, JP',
    rating: 4,
    content: 'Great retro collection — found a shirt I had been hunting for years. Fabric is comfortable and the print has held up after several washes. Delivery took twelve days.',
    date: '',
    avatar: '',
  },
  {
    id: 'rv_default_4',
    name: 'Marco B.',
    location: 'Milan, IT',
    rating: 5,
    content: 'Bought the away jersey and the matching windbreaker. Both feel true to size and the colours match the photos exactly. Customer service answered my sizing question within a day.',
    date: '',
    avatar: '',
  },
  {
    id: 'rv_default_5',
    name: 'Chris O.',
    location: 'Dublin, IE',
    rating: 5,
    content: 'The 30-day returns policy gave me the confidence to try two sizes. Kept the XL, returned the L — refund was processed without any hassle. Would order again.',
    date: '',
    avatar: '',
  },
  {
    id: 'rv_default_6',
    name: 'Samuel A.',
    location: 'Lagos, NG',
    rating: 4,
    content: 'Solid quality for the price and the tracking worked all the way to my door. Only note: the package took a bit longer than the estimated window, but it arrived safely.',
    date: '',
    avatar: '',
  },
];

const VISITORS_DEFAULTS: VisitorsConfig = {
  enabled: true,
  baseCount: 12,
  windowMinutes: 5,
  padToBase: true,
};

const HERO_DEFAULTS: HeroConfig = {
  enabled: true,
  intervalMs: 7000,
  slides: [
    {
      id: 'hero_default_1',
      image: '/assets/hero/hero-main.jpg',
      eyebrow: '26 / 27 season — now live',
      title: 'Wear the game.',
      subtitle: 'Club and national team jerseys from every major league — fan, player and kids versions, shipped worldwide.',
      ctaText: 'Shop the new season',
      ctaHref: '/collections/2026-27-season',
      cta2Text: 'Browse retro',
      cta2Href: '/collections/retro',
    },
    {
      id: 'hero_default_2',
      image: '/assets/hero/hero-alt.jpg',
      eyebrow: 'From the archive',
      title: 'Kits that made history.',
      subtitle: 'Hand-picked retro shirts from the seasons you remember — sourced, checked and shipped with care.',
      ctaText: 'Browse retro',
      ctaHref: '/collections/retro',
      cta2Text: 'New season',
      cta2Href: '/collections/2026-27-season',
    },
  ],
};

function normalizeHero(raw: unknown): HeroConfig {
  const h = (raw ?? {}) as Record<string, any>;
  const list = Array.isArray(h.slides) ? h.slides : HERO_DEFAULTS.slides;
  const slides = list.slice(0, 5).map((s: any, i: number) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const str = (k: string, fb: string) => {
      const v = String(o[k] ?? '').trim();
      return v ? v.slice(0, 300) : fb;
    };
    return {
      id: str('id', `hero_${i}_${Math.abs(hash(String(o.image ?? i)))}`),
      image: str('image', HERO_DEFAULTS.slides[i % HERO_DEFAULTS.slides.length].image),
      eyebrow: str('eyebrow', ''),
      title: str('title', HERO_DEFAULTS.slides[i % HERO_DEFAULTS.slides.length].title),
      subtitle: str('subtitle', ''),
      ctaText: str('ctaText', ''),
      ctaHref: str('ctaHref', '/collections/2026-27-season'),
      cta2Text: str('cta2Text', ''),
      cta2Href: str('cta2Href', ''),
    };
  }).filter((s: HeroSlide) => s.image && s.title);
  return {
    enabled: typeof h.enabled === 'boolean' ? h.enabled : HERO_DEFAULTS.enabled,
    intervalMs: clampInt(h.intervalMs, 3000, 15000, HERO_DEFAULTS.intervalMs),
    slides: slides.length ? slides : HERO_DEFAULTS.slides,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeBar(raw: unknown): AnnouncementBar {
  const b = (raw ?? {}) as Partial<AnnouncementBar>;
  const items = Array.isArray(b.items)
    ? b.items.map(s => String(s ?? '').trim()).filter(Boolean)
    : [];
  const fontSize = Number(b.fontSize);
  return {
    enabled: typeof b.enabled === 'boolean' ? b.enabled : BAR_DEFAULTS.enabled,
    items,
    color: typeof b.color === 'string' ? b.color.trim() : '',
    bg: typeof b.bg === 'string' ? b.bg.trim() : '',
    fontSize: Number.isFinite(fontSize) && fontSize >= 9 && fontSize <= 28
      ? Math.round(fontSize)
      : BAR_DEFAULTS.fontSize,
  };
}

/** 商品定制选项（对齐参考站：Custom name + number / Choose an armband patch） */
export type CustomizeConfig = {
  /** 是否启用定制区 */
  enabled: boolean;
  /** 姓名+号码烫印 */
  nameNumber: {
    enabled: boolean;
    /** 加价（USD） */
    price: number;
    /** 最大字符数 */
    maxLength: number;
    placeholder: string;
  };
  /** 袖章补丁（checkbox 多选一） */
  armband: {
    enabled: boolean;
    options: { label: string; price: number; image: string }[];
  };
};

const CUSTOMIZE_DEFAULTS: CustomizeConfig = {
  enabled: true,
  nameNumber: {
    enabled: true,
    price: 3,
    maxLength: 24,
    placeholder: 'Ronaldo#7',
  },
  armband: {
    enabled: true,
    options: [
      { label: 'World Cup badge', price: 3, image: '/assets/customize/badge-worldcup.png' },
      { label: 'Continental badge', price: 3, image: '/assets/customize/badge-champions.png' },
      { label: 'Other league patch', price: 3, image: '/assets/customize/badge-league.png' },
    ],
  },
};

function normalizeCustomize(raw: unknown): CustomizeConfig {
  const c = (raw ?? {}) as Record<string, any>;
  const nn = (c.nameNumber ?? {}) as Record<string, unknown>;
  const ab = (c.armband ?? {}) as Record<string, unknown>;
  const opts = Array.isArray(ab.options) ? ab.options : CUSTOMIZE_DEFAULTS.armband.options;
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : CUSTOMIZE_DEFAULTS.enabled,
    nameNumber: {
      enabled: typeof nn.enabled === 'boolean' ? nn.enabled : CUSTOMIZE_DEFAULTS.nameNumber.enabled,
      price: clampInt(nn.price, 0, 999, 3),
      maxLength: clampInt(nn.maxLength, 1, 100, 24),
      placeholder: typeof nn.placeholder === 'string' && nn.placeholder.trim()
        ? nn.placeholder.trim().slice(0, 40)
        : CUSTOMIZE_DEFAULTS.nameNumber.placeholder,
    },
    armband: {
      enabled: typeof ab.enabled === 'boolean' ? ab.enabled : CUSTOMIZE_DEFAULTS.armband.enabled,
      options: opts.slice(0, 8).map((o: any) => ({
        label: String(o?.label ?? '').trim().slice(0, 40) || 'Patch',
        price: clampInt(o?.price, 0, 999, 3),
        image: String(o?.image ?? '').trim().slice(0, 500) || '/assets/customize/armband.jpg',
      })).filter((o: { label: string }) => o.label),
    },
  };
}

const DEFAULTS: BrandSettings = {
  name: BRAND.name,
  domain: BRAND.domain,
  adminDomain: BRAND.adminDomain,
  supportEmail: BRAND.supportEmail,
  whatsapp: BRAND.whatsapp || '',
  supportQr: '',
  announcement: '',
  announcementBar: BAR_DEFAULTS,
  reviews: REVIEWS_DEFAULTS,
  visitors: VISITORS_DEFAULTS,
  customize: CUSTOMIZE_DEFAULTS,
  hero: HERO_DEFAULTS,
};

function normalizeReviews(raw: unknown): ReviewsConfig {
  const r = (raw ?? {}) as Partial<ReviewsConfig>;
  const list = Array.isArray(r.reviews) ? r.reviews : [];
  const reviews: Review[] = list.slice(0, 24).map((x, i) => {
    const o = (x ?? {}) as Partial<Review>;
    const name = String(o.name ?? '').trim().slice(0, 40);
    return {
      id: String(o.id ?? '').trim() || `rv_${i}_${Math.abs(hash(name + i))}`,
      name: name || 'Customer',
      location: String(o.location ?? '').trim().slice(0, 40),
      rating: clampInt(o.rating, 1, 5, 5),
      content: String(o.content ?? '').trim().slice(0, 600),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date ?? '')) ? String(o.date) : '',
      avatar: String(o.avatar ?? '').trim().slice(0, 500),
    };
  }).filter(x => x.content);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : REVIEWS_DEFAULTS.enabled,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 60) : REVIEWS_DEFAULTS.title,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle.trim().slice(0, 120) : '',
    // 后台未配置评价时展示默认演示评价（配置后完全替换）
    reviews: reviews.length ? reviews : DEFAULT_REVIEWS,
  };
}

function normalizeVisitors(raw: unknown): VisitorsConfig {
  const v = (raw ?? {}) as Partial<VisitorsConfig>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : VISITORS_DEFAULTS.enabled,
    baseCount: clampInt(v.baseCount, 0, 999, VISITORS_DEFAULTS.baseCount),
    windowMinutes: clampInt(v.windowMinutes, 1, 60, VISITORS_DEFAULTS.windowMinutes),
    padToBase: typeof v.padToBase === 'boolean' ? v.padToBase : VISITORS_DEFAULTS.padToBase,
  };
}

/** 简单稳定哈希，用于给缺 id 的评价生成兜底 id */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function loadBrand(): BrandSettings {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const b = s?.brand ?? {};
    // 兼容旧结构：announcement 是单行字符串时，作为滚动条唯一一条文案
    const legacy = typeof s?.announcement === 'string' ? s.announcement.trim() : '';
    const bar = normalizeBar(s?.announcementBar);
    if (!bar.items.length && legacy) bar.items = [legacy];
    return {
      name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : DEFAULTS.name,
      domain: typeof b.domain === 'string' && b.domain.trim() ? b.domain.trim() : DEFAULTS.domain,
      adminDomain: typeof b.adminDomain === 'string' && b.adminDomain.trim() ? b.adminDomain.trim() : DEFAULTS.adminDomain,
      supportEmail: typeof b.supportEmail === 'string' && b.supportEmail.trim() ? b.supportEmail.trim() : DEFAULTS.supportEmail,
      whatsapp: typeof b.whatsapp === 'string' ? b.whatsapp.trim() : DEFAULTS.whatsapp,
      supportQr: typeof b.supportQr === 'string' ? b.supportQr.trim() : DEFAULTS.supportQr,
      announcement: legacy,
      announcementBar: bar,
      reviews: normalizeReviews(s?.reviews),
      visitors: normalizeVisitors(s?.visitors),
      customize: normalizeCustomize(s?.customize),
      hero: normalizeHero(s?.hero),
    };
  } catch {
    return DEFAULTS;
  }
}
