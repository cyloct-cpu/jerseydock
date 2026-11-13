import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Announcement, Footer, Header } from '@/components/Chrome';
import { FloatingContact } from '@/components/FloatingContact';
import Script from 'next/script';
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
  // Meta Pixel：后台设置页配置 ID 后全站启用（基码 PageView 自带，电商事件见 lib/fbpixel.ts）
  const pixelId = brand.metaPixel.enabled ? brand.metaPixel.id : '';
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
        {/* Meta Pixel 基码：标准官方片段；beforeInteractive 保证 fbevents 尽早可用（事件在交互后才发） */}
        {pixelId ? (
          <Script id="meta-pixel" strategy="beforeInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
