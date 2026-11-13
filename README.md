# JERSEYDOCK — 球衣跨境电商独立站

> **JERSEYDOCK**（[jerseydock.shop](https://jerseydock.shop)）是面向国际客户的足球球衣电商：前台商城 + 独立管理后台。仓库名/包名 `kitvault` 仅是内部代号，**所有用户可见文案一律用 JERSEYDOCK**。
>
> 与主站 [jerseyshelf.com](https://jerseyshelf.com)（另一仓库）共存于同一台服务器，通过 catalog-sync 做商品目录级协同，两站数据互相隔离。

## 技术栈

- **Next.js 15（App Router）× 2**：`apps/web` 前台商城 + `apps/admin` 管理后台（独立站点、独立登录、独立会话）
- **npm workspaces monorepo**：`apps/*` + `packages/*`
- **数据层**：SQLite（`node:sqlite` 同步 API，Prisma 管 schema）为主 + 文件存储为辅，见[数据层架构](#数据层架构)
- **图片搜索**：本地 CLIP（transformers.js + ONNX，原生模块走 serverExternalPackages）+ 视觉大模型兜底
- **邮件**：Resend HTTP API（SPF/DKIM/DMARC 已配）
- **登录**：邮箱验证码 + Google OAuth（Apple 预留）

## 仓库结构

| 路径 | 说明 |
|---|---|
| `apps/web` | 前台商城（3000 端口）：首页/分类/商品/购物车/结账/订单/账户/图搜/内容页 |
| `apps/admin` | 管理后台（3001 dev / 3002 prod）：看板/商品/订单/物流/客户/CRM/图库/设置/同步/账号 |
| `packages/shared` | 共享类型与逻辑：品牌配置、货币表、商品数据集、OMS/支付/运费契约、状态映射 |
| `packages/db` | Prisma schema + 种子（订单/用户/商品/审计等表的真源） |
| `packages/i18n` | i18n 词典包（7 内置语言，其余 22 语言走机翻补全） |
| `data/` | 运行时数据：SQLite 库（`packages/db/prisma/dev.db`）之外的设置/队列/日志/导入工作区 |
| `scripts/` | 数据集构建、采集、迁库、主站同步等一次性/维护脚本 |
| `docs/` | 设计与执行文档（开发执行文档为历史执行依据，OMS 对接四件套等） |

## 快速开始

```bash
npm install
npm run dev          # 前台商城  → http://localhost:3000
npm run dev:admin    # 管理后台  → http://localhost:3001（改代码热更新）
npm run build        # 双站生产构建
```

- 后台演示账号：`admini / admini123`（owner 全权限；生产勿用，账号同时存在于 `data/admin/admins.json` + SQLite AdminUser 表——**加账号两边都要写**，见后台双源说明）
- 商品数据集：3736 件（`packages/shared/src/data/products.ts` 自动生成，图片外链 img.staticdj.com + 后台导入 4500+ 件）

## 核心功能

### 前台商城（apps/web）

- **目录浏览**：按赛季/国家队/俱乐部/儿童等分类（3800+ 商品，SEO：sitemap 3860 URL、商品页 Product JSON-LD、Organization 结构化数据）
- **29 种语言**：7 内置词典 + 22 语言机翻补全（服务端词典缓存 + 客户端懒 MT），国名用 `Intl.DisplayNames` 零 API 覆盖任意语言；地址输入支持任意语言识别
- **40 种货币展示**：USD 基准存储，展示层按汇率换算（`data/fx-last.json` 定时同步）
- **商品定制**：姓名号码烫印 + 袖章补丁（后台可配价格/选项，服务端核价防篡改）
- **结账**：COD 货到付款（默认）/ 在线支付（Stripe、PayPal 托管收银台跳转）/ 银行转账（WorldFirst/XTransfer 收款信息展示），多件阶梯优惠
- **以图搜款**：上传/拍摄球衣照片找同款（本地 CLIP 为主，置信度不足时调用后台配置的视觉大模型兜底，失败冷却 10 分钟）
- **订单追踪**：登录用户账户中心；游客下单生成签名链接（可收藏/复制），含物流轨迹

### 管理后台（apps/admin）

- **看板**：经营总览（订单/履约/客户/流量实时汇总、7 天趋势）
- **商品**：新增/编辑/上下架/批量操作、批量导入（CSV/XLSX/ZIP 三步流程，图片落 `public/imports/`）、图库管理、主站同步
- **订单**：搜索/筛选/导出 CSV、款项状态流转、批量发货、删除（审计日志）
- **物流**：OMS 代发对接（见下）、轨迹轮询、面单打印、COD 回款确认（单个/批量）、人工标记签收/拒收
- **CRM**：客户管理、回访看板、埋点数据（浏览/加购/结算漏斗）、导出
- **设置**：品牌信息、公告条、评价、实时访客数、商品定制、Hero 轮播、支付通道、Meta Pixel、OMS 代发、以图搜款视觉 API、后台账号管理（RBAC 权限）

## 数据层架构

**真源是 SQLite**（`packages/db/prisma/dev.db`），文件层是历史兼容：

- `lib/db-store.ts`（web/admin **两份同内容**，改一处必须同步另一处）：`node:sqlite` 同步 API 拦截层，提供"原 JSON 结构"级读写；溢出字段存 `ext` JSON 列往返无损，调用方零改动
- `lib/store.ts`（admin）/ `payment.ts` 等（web）按文件名把 `orders.jsonl/users.jsonl/...` 路径拦截转 SQLite；未迁库实体（settings/overrides/events/contacts/队列/日志）仍走文件
- **坑**：所有文件写入必须走 `store.ts` 的 `writeJson`（临时文件 + fsync + rename 原子写）——sync worker 持续写 settings 与后台保存曾竞态写坏文件；`Order` 表没有的列（shipment/shippedAt）放 `ext`，列入 known 字段会静默丢数据

## 关键子系统

### OMS 物流代发（COD 主链路）

服务商：OMS（HTTP API，文档见 `docs/oms-api参考.md`）。流程：

1. COD 下单 → 入推送队列（`data/oms/push-queue.jsonl`）
2. admin worker（每 60s）消费队列 → `CreateLogisticsOrder` → 拿回运单号 + 下载面单落 `data/labels/`
3. worker（每 30 分钟）轮询轨迹 → 更新 `shipment.events` / `fulfillmentStatus`（`omsTrackToFulfillment`：已签收→delivered、拒收/退件→exception）
4. COD 签收后人工确认回款（服务商结算对账）→ `paymentStatus=paid`

### Meta 追踪（Pixel + Conversions API）

像素/数据集 ID **1542284121254778**（后台设置页「Meta Pixel」卡片可配，改 ID 免部署）。

| 层 | 事件 | 触发 |
|---|---|---|
| 浏览器像素（`apps/*/lib/fbpixel.ts`） | PageView / ViewContent / AddToCart / InitiateCheckout | 漏斗上层行为，即时 |
| 服务端 CAPI（`apps/*/lib/capi.ts` + `lib/purchase.ts`） | `CODOrderPlaced`（自定义） | COD 订单创建成功（≠成交） |
| 服务端 CAPI | **Purchase**（标准） | 统一成交确认：在线支付=收款确认即发；**COD=签收 delivered ∧ 收款 paid** |

- **核心原则**：COD 下单 ≠ 成交。浏览器端不发 Purchase（防虚标 + 刷新重复）
- **幂等**：订单 `purchaseStatus`（pending/sent 锁，挂 `ext` 列）+ 确定性 `event_id`（`placed-<订单号>` / `cod-<订单号>`，Meta 侧 48h 去重兜底）；人工确认（标记回款/标记已支付）、人工标记签收、worker sweep（60s 对账）多路径并发最多回传一次
- **可靠性**：`data/meta-capi-queue.jsonl` 队列（Token 未配置时挂起不丢事件）+ 指数退避重试（2^n 分钟，上限 6h，12 次标 failed）+ `data/meta-capi.log` 台账（不落 Token）
- **归因**：下单时存 `_fbp/_fbc` 进订单（ext），回传 Purchase 时带上做浏览器/服务器事件关联；邮箱/手机号 SHA-256 规范化后传

### 支付

- **COD**：下单即建单（`paymentStatus=cod`），签收+收款后成交
- **在线**：Stripe / PayPal 托管收银台（`packages/shared/src/payment`），回跳页/ webhook 核验后 `markOrderPaid` → 幂等标记 → Purchase 回传
- **转账**：WorldFirst / XTransfer 收款信息展示，后台人工确认到账

### 主站同步（catalog-sync，K-S2）

jerseyshelf（主站）→ jerseydock（本店）单向商品同步：API 拉取增量（cursor + syncHash 幂等）→ upsert SQLite（`ext.src='sync'` 域隔离，防误删数据集/导入商品）→ 本店差异（CatalogOverride 价格/标题/上下架）。图片走 `/media/<sha256>` 内容寻址，未命中自动从主站拉取并永久落盘（自愈）。当前服务器侧 `sync.enabled` 可在后台「主站同步」页控制。

### 以图搜款

本地 CLIP 模型（`@huggingface/transformers` + `onnxruntime-node` + `sharp`，`serverExternalPackages` 保持原生模块不被打包）为主引擎；置信度不足时调用后台「视觉 API」配置的聚合站视觉大模型兜底（模型列表自动拉取、视觉模型优先、失败冷却 10 分钟）。

## 环境变量

| 变量 | 用途 | 位置 |
|---|---|---|
| `ADMIN_SESSION_SECRET` | 后台会话签名（生产必须覆盖） | 服务器 systemd drop-in |
| `SMTP_PASS` / `MAIL_FROM` 等 | Resend 发信 API Key 与发件人 | `.env.production`（**不得带 HTTP_PROXY/HTTPS_PROXY**，见部署陷阱） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | `.env.production` / 本地 `.env.local` |
| `SITE_URL` | 站点 URL（OAuth 回调等用） | 同上 |
| `META_ACCESS_TOKEN` | Meta CAPI 回传令牌（仅服务端，不入库不入 Git） | 服务器两端 `.env.production` |
| `META_TEST_EVENT_CODE` | CAPI 测试事件码（仅测试环境） | 仅测试环境 |
| `META_API_VERSION` | Graph API 版本（默认 v21.0） | 可选 |
| `OMS_CUSTOMER_CODE` / `OMS_CUSTOMER_PWD` / `OMS_BASE_URL` | OMS 兜底凭据（后台设置优先） | 可选 |

## 部署

生产：雨云香港服务器（nginx 反代 + Let's Encrypt；systemd 服务 `jerseydock-web` 3000 / `jerseydock-admin` 3002；部署目录 `/opt/jerseydock/`）。

**web 与 admin 都用 standalone 构建**（服务器 ExecStart 是 `node server.js`，读 `required-server-files.json`；常规构建产物会报 `routesManifest.dataRoutes is not iterable`）：

```bash
# 本地构建（web 与 admin 相同姿势）
BUILD_STANDALONE=1 npm run build --workspace=@kitvault/web

# 打包（排除 public——17G 图片库服务器已有；admin 还要排除 .next/cache）
cd apps/web/.next && cp -r static standalone/apps/web/.next/static
cd standalone && tar --exclude='apps/web/public' -cf web.tar apps/web
# static 单独打包，服务器解到 apps/web/.next/static

# 上传解压：tar 根是 apps/web|apps/admin/，必须解到 /opt/jerseydock（-C 到 apps/xx 会嵌套解压不生效）
scp web.tar server:/tmp/ && ssh server "tar -xf /tmp/web.tar -C /opt/jerseydock && systemctl restart jerseydock-web"
```

**部署铁律（踩过的坑）**：

1. 解压后必查 `.env.production` 代理行：本地的 `HTTP_PROXY/HTTPS_PROXY`（本机 Clash 出网用）打进包会让服务器全部 fetch 静默失败（Resend 401 等），`sed` 删掉
2. admin 常规构建与 standalone 混用会崩溃循环（见上），`dataRoutes is not iterable` 就是这个
3. 构建前杀掉本地 3000/3001 的 node 进程（Windows 文件锁导致产物残缺）
4. **不能**用本地 dev.db 覆盖服务器库
5. 数据库 schema 变更走 `npm run db:push`（Prisma），订单新增字段优先放 `ext` 列免迁移

## 数据目录（data/）

| 路径 | 说明 |
|---|---|
| `admin/settings.json` | 商店设置（品牌/公告/支付/定制/像素/OMS/sync），原子写 |
| `admin/admins.json` | 后台账号（登录读它 + SQLite AdminUser，**双源都要写**） |
| `admin/overrides.json` / `imported-products.json` | 商品改价覆盖 / 导入商品 |
| `admin/audit.jsonl` | 后台审计日志（登录/改价/删单/状态变更…） |
| `events.logl` | 前台埋点（浏览/加购/结算漏斗，CRM 导入用） |
| `oms/push-queue.jsonl` | OMS 推送队列 |
| `meta-capi-queue.jsonl` / `meta-capi.log` | Meta CAPI 回传队列（幂等台账）/ 发送日志 |
| `imports/` / `labels/` / `mt-cache/` / `media-shared/` | 导入工作区 / 面单 PDF / 机翻缓存 / 主站共享图片落盘 |

## 常用脚本

```bash
npm run dataset      # 重建商品数据集（packages/shared/src/data/products.ts）
npm run db:push      # Prisma schema → SQLite
npm run db:seed      # 种子数据
node scripts/migrate-jsonl-to-db.mjs   # JSONL → SQLite 迁移（K-S0-3）
node scripts/sync-from-jerseyshelf.mjs # 主站目录同步（手动触发）
```

## 文档索引

- `docs/开发执行文档.md` — 需求编号（N1~N12）与执行记录（历史依据）
- `docs/oms-物流对接方案.md` + `docs/oms-api参考.md` — OMS 对接
- `docs/双店协同整合方案.md` / `docs/双店部署清单.md` — 与 jerseyshelf 的协同
- `docs/设计规范.md` — 视觉规范（素材 70% / 排版 20% / 动效 10%，动效克制）
- 《JerseyDock COD 订单与 Meta Pixel / CAPI 需求、修改及测试验收文档》（外部 docx）— Meta 追踪的执行与验收依据

## 已知约定与注意事项

- 价格一律 **USD 基准**存储，展示层换算；Purchase/CODOrderPlaced 回传统一 `currency: USD`
- 排版以 English 为基准语言，其他语言只做翻译填充；**新增页面文案必须走 i18n 管线**（`<T>` 组件或 `<TextT9n>`），不许硬编码英文
- 默认评价为运营演示内容（后台配置后完全替换）；商品素材为采集所得，正式商用需替换自有授权素材
- 后台 UI 全中文；前台 29 语言
