import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Announcement, Footer, Header } from '@/components/Chrome';
import { FloatingContact } from '@/components/FloatingContact';
import { loadBrand } from '@/lib/brand';
import { getSessionUserServer } from '@/lib/users';

export const metadata: Metadata = {
  metadataBase: new URL('https://jerseydock.shop'),
  title: {
    default: 'JERSEYDOCK — Club & national team jerseys',
    template: '%s · JERSEYDOCK',
  },
  description: 'Club and national team jerseys from every major league. Fan, player and kids versions. Worldwide delivery, 30-day returns.',
  openGraph: {
    type: 'website',
    siteName: 'JERSEYDOCK',
    locale: 'en_US',
  },
};

/** Organization 结构化数据（全站每页注入，Google 知识面板/品牌信息用） */
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'JERSEYDOCK',
  url: 'https://jerseydock.shop',
  description: 'Club and national team jerseys from every major league. Fan, player and kids versions. Worldwide delivery, 30-day returns.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 品牌占位信息（N7）：后台 /settings 可在线修改，见 lib/brand.ts
  const brand = loadBrand();
  // 前台用户登录态（kv_session cookie）；读取 cookie 会使路由动态渲染
  const user = await getSessionUserServer();
  return (
    // translate="no"：本站自带 29 语言 i18n（lib/i18n.ts + 语言切换器），
    // 告知翻译类浏览器扩展不要介入——否则会与本站翻译冲突并导致 React Hydration 失败；
    // suppressHydrationWarning：兜底容忍扩展对 html/body 的属性注入。
    <html lang="en" translate="no" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400;0,500;0,600;0,700;1,600&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <StoreProvider>
          {/* 公告条 + 导航整体吸顶（滚动时一起固定） */}
          <div className="topbar">
            <Announcement bar={brand.announcementBar} />
            <Header brandName={brand.name} user={user} />
          </div>
          <main>{children}</main>
          <Footer brandName={brand.name} supportEmail={brand.supportEmail} />
          <FloatingContact whatsapp={brand.whatsapp} supportQr={brand.supportQr} supportEmail={brand.supportEmail} />
        </StoreProvider>
      </body>
    </html>
  );
}
