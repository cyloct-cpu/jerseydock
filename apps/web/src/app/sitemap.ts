import type { MetadataRoute } from 'next';
import { allProducts, isActive } from '@/lib/catalog';
import { CATEGORIES } from '@kitvault/shared';

export const dynamic = 'force-dynamic';

const BASE = 'https://jerseydock.shop';

/**
 * 全站 sitemap：静态页 + 有在售商品的分类页 + 全部在售商品页。
 * force-dynamic：后台改上架状态后 sitemap 即时反映，无需重新构建。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/clubs`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/nations`, changeFrequency: 'weekly', priority: 0.8 },
    ...['shipping', 'returns', 'about', 'faq', 'contact'].map(slug => ({
      url: `${BASE}/pages/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];

  // 只收录有在售商品的分类（与前台 groups() 的展示逻辑一致）
  const onSale = new Set<string>();
  for (const p of allProducts()) {
    if (!isActive(p)) continue;
    for (const slug of p.cl) onSale.add(slug);
  }
  const collectionRoutes: MetadataRoute.Sitemap = CATEGORIES.filter(c => onSale.has(c.slug)).map(c => ({
    url: `${BASE}/collections/${c.slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const productRoutes: MetadataRoute.Sitemap = allProducts()
    .filter(isActive)
    .map(p => ({
      url: `${BASE}/products/${p.h}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  return [...staticRoutes, ...collectionRoutes, ...productRoutes];
}
