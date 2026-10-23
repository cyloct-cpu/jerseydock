import { BRAND } from '@kitvault/shared';

/** 品牌 Logo 组件（需求 N7）——圆形图标 + 品牌名；替换图片改 brand.ts 的 logoIcon */
export function BrandLogo({ dark = false, name }: { dark?: boolean; name?: string }) {
  return (
    <span className="brand" aria-label={name || BRAND.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-ico" src={`${BRAND.logoIcon}?v=2`} alt="" width={36} height={36} />
      {name || BRAND.name}
    </span>
  );
}
