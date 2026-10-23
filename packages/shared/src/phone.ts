/**
 * 电话 / WhatsApp 号码：区号表与拆分合并工具
 * 存储格式统一为「+区号 号码」（如 +86 138 0000 0000），wa.me 链接取纯数字。
 * PHONE_CC 为常用区号精选（覆盖主要市场），未列出的市场可先手选相近区号或用其他方式联系。
 */

export type PhoneCC = { cc: string; iso: string; name: string };

export const PHONE_CC: PhoneCC[] = [
  { cc: '+86', iso: 'CN', name: 'China' },
  { cc: '+1', iso: 'US', name: 'United States / Canada' },
  { cc: '+44', iso: 'GB', name: 'United Kingdom' },
  { cc: '+81', iso: 'JP', name: 'Japan' },
  { cc: '+82', iso: 'KR', name: 'South Korea' },
  { cc: '+852', iso: 'HK', name: 'Hong Kong' },
  { cc: '+853', iso: 'MO', name: 'Macao' },
  { cc: '+886', iso: 'TW', name: 'Taiwan' },
  { cc: '+65', iso: 'SG', name: 'Singapore' },
  { cc: '+60', iso: 'MY', name: 'Malaysia' },
  { cc: '+66', iso: 'TH', name: 'Thailand' },
  { cc: '+84', iso: 'VN', name: 'Vietnam' },
  { cc: '+62', iso: 'ID', name: 'Indonesia' },
  { cc: '+63', iso: 'PH', name: 'Philippines' },
  { cc: '+91', iso: 'IN', name: 'India' },
  { cc: '+61', iso: 'AU', name: 'Australia' },
  { cc: '+64', iso: 'NZ', name: 'New Zealand' },
  { cc: '+49', iso: 'DE', name: 'Germany' },
  { cc: '+33', iso: 'FR', name: 'France' },
  { cc: '+39', iso: 'IT', name: 'Italy' },
  { cc: '+34', iso: 'ES', name: 'Spain' },
  { cc: '+31', iso: 'NL', name: 'Netherlands' },
  { cc: '+32', iso: 'BE', name: 'Belgium' },
  { cc: '+41', iso: 'CH', name: 'Switzerland' },
  { cc: '+43', iso: 'AT', name: 'Austria' },
  { cc: '+46', iso: 'SE', name: 'Sweden' },
  { cc: '+47', iso: 'NO', name: 'Norway' },
  { cc: '+45', iso: 'DK', name: 'Denmark' },
  { cc: '+358', iso: 'FI', name: 'Finland' },
  { cc: '+351', iso: 'PT', name: 'Portugal' },
  { cc: '+30', iso: 'GR', name: 'Greece' },
  { cc: '+48', iso: 'PL', name: 'Poland' },
  { cc: '+420', iso: 'CZ', name: 'Czechia' },
  { cc: '+36', iso: 'HU', name: 'Hungary' },
  { cc: '+40', iso: 'RO', name: 'Romania' },
  { cc: '+380', iso: 'UA', name: 'Ukraine' },
  { cc: '+7', iso: 'RU', name: 'Russia / Kazakhstan' },
  { cc: '+90', iso: 'TR', name: 'Türkiye' },
  { cc: '+971', iso: 'AE', name: 'United Arab Emirates' },
  { cc: '+966', iso: 'SA', name: 'Saudi Arabia' },
  { cc: '+974', iso: 'QA', name: 'Qatar' },
  { cc: '+965', iso: 'KW', name: 'Kuwait' },
  { cc: '+20', iso: 'EG', name: 'Egypt' },
  { cc: '+27', iso: 'ZA', name: 'South Africa' },
  { cc: '+52', iso: 'MX', name: 'Mexico' },
  { cc: '+55', iso: 'BR', name: 'Brazil' },
  { cc: '+54', iso: 'AR', name: 'Argentina' },
  { cc: '+56', iso: 'CL', name: 'Chile' },
  { cc: '+57', iso: 'CO', name: 'Colombia' },
  { cc: '+507', iso: 'PA', name: 'Panama' },
];

/** 已存值（如 "+86 138 0000 0000"）→ { cc, num }；识别不了的区号归入 +86 之外的 "+0"？——归入第一个匹配或默认 CN */
export function splitPhoneValue(value: string): { cc: string; num: string } {
  const v = String(value || '').trim();
  if (!v) return { cc: '+86', num: '' };
  // 最长区号优先匹配（+852 vs +85）
  const sorted = [...PHONE_CC].sort((a, b) => b.cc.length - a.cc.length);
  for (const { cc } of sorted) {
    if (v === cc) return { cc, num: '' };
    if (v.startsWith(cc + ' ') || v.startsWith(cc + '-')) {
      return { cc, num: v.slice(cc.length).trim() };
    }
  }
  // 无匹配区号：当作已含自带区号的号码，放号码位
  const m = v.match(/^(\+\d{1,4})\s*(.+)$/);
  if (m) return { cc: m[1], num: m[2] };
  return { cc: '+86', num: v };
}

/** 区号 + 号码 → 存储值；号码为空返回空串（不存只有区号的值） */
export function joinPhoneValue(cc: string, num: string): string {
  const n = String(num || '').replace(/[^\d\s-]/g, '').trim();
  if (!n) return '';
  return `${cc} ${n}`;
}

/** wa.me 等链接用：取纯数字 */
export function phoneDigits(value: string): string {
  return String(value || '').replace(/[^0-9]/g, '');
}
