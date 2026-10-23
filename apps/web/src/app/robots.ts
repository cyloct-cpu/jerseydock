import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 交易/账户类页面无收录价值，且商品搜索结果页避免产生重复内容
        disallow: ['/api/', '/checkout', '/cart', '/account', '/orders', '/login', '/register', '/search'],
      },
    ],
    sitemap: 'https://jerseydock.shop/sitemap.xml',
  };
}
