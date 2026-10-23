/**
 * 图片上传规则（客户端预校验 + 文案提示）
 * 纯浏览器环境可用（不引入 node 模块），三个上传入口共用：
 * - Hero 轮播：横图，宽高比 1.1–3.2，长边 ≥ 800px
 * - 商品图：竖图优先，宽高比 0.55–1.15（约 3:4 至 1:1），短边 ≥ 600px
 * - 图库：通用，宽高比 0.5–2.2，短边 ≥ 400px
 */

export const IMG_MAX_BYTES = 5 * 1024 * 1024;
export const IMG_MAX_SIDE = 6000;
export const IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';
export const IMG_FORMATS_TEXT = 'jpg / png / webp / avif';

export type ImgContext = 'hero' | 'product' | 'media';

type Rule = {
  label: string;
  /** 允许的宽高比区间 [min, max] */
  ratio: [number, number];
  /** 短边最小像素 */
  minShort: number;
  /** 长边最小像素（Hero 需要足够宽） */
  minLong?: number;
  /** 面向用户的推荐比例描述 */
  hint: string;
};

const RULES: Record<ImgContext, Rule> = {
  hero: {
    label: 'Hero 轮播',
    ratio: [1.1, 3.2],
    minShort: 440,
    minLong: 800,
    hint: '横图（约 16:9 至 3:1），长边 ≥ 800px',
  },
  product: {
    label: '商品图',
    ratio: [0.55, 1.15],
    minShort: 600,
    hint: '竖图（约 3:4 至 1:1），短边 ≥ 600px',
  },
  media: {
    label: '图库图片',
    ratio: [0.5, 2.2],
    minShort: 400,
    hint: '宽高比 0.5–2.2，短边 ≥ 400px',
  },
};

/** 读取图片像素尺寸（浏览器解码后取 naturalWidth/Height） */
function probeImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (w && h) resolve({ w, h });
      else reject(new Error('bad image'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('bad image'));
    };
    img.src = url;
  });
}

/**
 * 校验单张图片。返回错误描述（中文），通过返回 null。
 * 顺序：格式 → 大小 → 可解析性 → 尺寸上下限 → 宽高比。
 */
export async function validateImage(file: File, ctx: ImgContext): Promise<string | null> {
  const rule = RULES[ctx];
  if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
    return `不支持的格式：${file.name}（仅 ${IMG_FORMATS_TEXT}）`;
  }
  if (file.size > IMG_MAX_BYTES) {
    return `超过 5MB：${file.name}（${(file.size / 1024 / 1024).toFixed(1)}MB）`;
  }
  if (file.size < 1024) {
    return `文件异常，可能已损坏：${file.name}`;
  }
  let w = 0;
  let h = 0;
  try {
    ({ w, h } = await probeImageSize(file));
  } catch {
    return `无法解析的图片：${file.name}`;
  }
  if (Math.max(w, h) > IMG_MAX_SIDE) {
    return `尺寸过大：${file.name}（${w}×${h}，单边需 ≤ ${IMG_MAX_SIDE}px）`;
  }
  if (w < rule.minShort || h < rule.minShort) {
    return `尺寸过小：${file.name}（${w}×${h}，${rule.label}要求短边 ≥ ${rule.minShort}px）`;
  }
  const ratio = w / h;
  if (ratio < rule.ratio[0] || ratio > rule.ratio[1]) {
    return `比例不符合${rule.label}要求：${file.name}（${w}×${h}，宽高比需在 ${rule.ratio[0]}–${rule.ratio[1]}）`;
  }
  if (rule.minLong && Math.max(w, h) < rule.minLong) {
    return `宽度不足：${file.name}（${w}×${h}，${rule.label}要求长边 ≥ ${rule.minLong}px）`;
  }
  return null;
}

/** 该场景的上传规则提示文案 */
export function imgRuleHint(ctx: ImgContext): string {
  const rule = RULES[ctx];
  return `${rule.label}：${rule.hint} · 单张 ≤ 5MB · ${IMG_FORMATS_TEXT}`;
}
