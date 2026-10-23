# apps/web — 前台商城（顾客端）

面向国际顾客的球衣电商前台。**独立应用**，端口 3000，独立部署到前台域名。

## 启动

```bash
npm install       # 根目录，monorepo workspaces
npm run dev       # http://localhost:3000
```

## 职责
- 商品浏览：首页、分类页（国家队/俱乐部/赛季/复古/儿童/外套/短裤）、商品详情页
- 交易：购物车、结算（**支付占位**，下单生成待支付订单）、免登录订单查询
- 售后：物流轨迹查询（订单号 + 邮箱，含承运商直链）
- 多语言 / 多货币展示（7 语言 / 7 币种，按国家推荐）
- 顾客行为埋点（浏览/停留时长/加购/结算开始/留联系方式 → 供后台 CRM）

## 目录
| 路径 | 功能 |
|---|---|
| `src/app/` | 路由：`/` 首页、`/collections/[slug]`、`/nations`、`/clubs`、`/products/[handle]`、`/cart`、`/checkout`、`/orders/track`、`/account`、`/pages/[slug]` 静态页（shipping/returns/size-guide/about/faq/contact）、`not-found` |
| `src/app/api/` | `POST /api/orders` 创建订单（服务端核价）、`GET /api/orders/track` 免登录查单、`POST /api/contact` 留言、`POST /api/track` 埋点 |
| `src/components/` | BrandLogo / Chrome（公告+导航+页脚）/ Controls（语言货币）/ FootballCursor / ProductCard / Reveal / Price |
| `src/lib/` | `store.tsx`（购物车+货币+语言上下文）、`catalog.ts`（目录+后台覆盖合并）、`i18n.ts`（7 语言包）、`pricing.ts`（满减/运费规则）、`track.ts`（埋点）、`brand.ts`（品牌占位） |
| `src/app/globals.css` | 设计令牌与全部组件样式（色彩/字号/间距/动效） |
| `public/` | 静态资源；`/imports/<批次>/<SKU>/` 由后台导入时自动写入 |

## 数据来源
- 商品：`@kitvault/shared` 静态数据集（采集 chenyikan.shop，3736 件）+ `data/admin/imported-products.json`（后台导入）+ `data/admin/overrides.json`（上架状态/价格覆盖，默认全部上架）
- 订单：`data/orders.jsonl`（与后台共用）

## 约束
- 排版以 **English 为设计基准**，其他语言只替换文本（N4）
- 价格一律由 USD 基准换算展示；订单记录下单币种快照
- 动效遵循 `docs/设计规范.md`：400–800ms、位移 8–24px、只做 opacity/transform
- **不提供任何管理员登录入口**（N6），后台在 `apps/admin`
- 品牌名与 Logo 一律走 `<BrandLogo />` 与 `BRAND` 配置（后台 `/settings` 可在线覆盖），不写死（N7）
