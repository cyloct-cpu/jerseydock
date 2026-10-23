/**
 * 品牌与域名占位配置（需求 N7）
 * 替换品牌名 / 域名 / Logo 时**只改这里**，全站生效；后台 /settings 也可在线覆盖。
 * TODO: 确定品牌名后替换 BRAND_NAME，替换域名后替换 STORE_DOMAIN / ADMIN_DOMAIN。
 */
export const BRAND = {
  name: 'JERSEYDOCK',                 // TODO: 品牌名
  tagline: 'Jerseys for every game',
  domain: 'STORE_DOMAIN',           // TODO: 前台域名
  adminDomain: 'ADMIN_DOMAIN',      // TODO: 后台独立域名
  supportEmail: '',                 // 真实客服邮箱（后台填写，空则前端不显示邮箱入口）
  whatsapp: '',                     // TODO: WhatsApp 客服号
  logoLight: '/brand/logo-vertical-light.jpg', // 白字竖版整标（深色背景整版展示用）
  logoDark: '/brand/logo-horizontal-dark.png', // 深字横版整标（浅色背景用）
  logoIcon: '/brand/logo-icon.png',            // 圆形图标（头部/侧栏/网页图标）
} as const;

export type Brand = typeof BRAND;
