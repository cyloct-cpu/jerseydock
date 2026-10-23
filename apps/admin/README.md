# apps/admin — 后台管理系统（独立站点）

**与前台完全分离**：独立应用、独立端口（3001）、独立域名/子域、独立鉴权体系。
前台不提供任何管理员入口，也不共享 Session（需求 N6）。

## 启动

```bash
npm install          # 根目录，monorepo workspaces
npm run dev:admin    # http://localhost:3001
```

演示账号：`owner@kitvault.local` / `admin123`（数据在 `data/admin/admins.json`，接入数据库后切换为 `AdminUser` 表）。

## 职责
- 商品管理：列表、搜索、筛选、**批量上架/下架/删除/改价**（N3）
- **批量导入（文件夹式）**：按款式文件夹批量上品，导入后默认 `draft` 未上架（N3）
- 订单与物流：状态流转、批量导入物流单号、轨迹时间轴（N2）
- 客户管理 CRM：客户档案、行为事件、回购次数、回访进度（N9）
- 设置：品牌/域名占位信息、公告、支付占位文案、数据导出（N7/N8）

## 目录
| 路径 | 功能 |
|---|---|
| `src/app/login/` | 独立登录（useActionState + scrypt 校验） |
| `src/app/dashboard/` | 数据看板（订单/营收/待支付/待发货/客户/回访 KPI） |
| `src/app/products/` | 商品列表：搜索/筛选/分页/批量操作/改价 |
| `src/app/products/import/` | 批量导入：文件夹 → 解析 → 校验预览 → 入库（默认未上架）→ 可回滚 |
| `src/app/orders/` | 订单管理：筛选/标记支付/发货/批量填单号 |
| `src/app/shipping/` | 物流管理：轨迹时间轴、承运商查询直链 |
| `src/app/customers/` | 客户 CRM：常用筛选（加购未付款/未下单/留联系方式/回购） |
| `src/app/customers/followup/` | 回访看板（待回访/联系中/已转化/已流失/不感兴趣） |
| `src/app/settings/` | 商店设置（品牌占位、公告、支付开关文案）+ CSV 导出 |
| `src/app/api/export/` | 订单/客户/埋点 CSV 导出 |
| `src/lib/auth.ts` | 会话（HMAC Cookie）、scrypt 密码、审计日志 |
| `src/lib/actions.ts` | 全部 Server Actions（写操作入口） |
| `src/lib/import-parse.ts` | CSV/JSON 解析、字段映射、逐行校验 |
| `src/lib/metrics.ts` | 客户档案聚合与看板指标 |
| `src/lib/store.ts` | 文件数据层（orders.jsonl / events.logl / admin/*.json） |
| `src/middleware.ts` | 未登录访问统一跳转 /login |

## 数据落点（开发期）
| 文件 | 内容 | 写入方 |
|---|---|---|
| `data/orders.jsonl` | 订单 | 前台 `/api/orders` |
| `data/events.logl` | 埋点（浏览/加购/结算/联系） | 前台 `/api/track` |
| `data/contacts.jsonl` | 联系表单 | 前台 `/api/contact` |
| `data/admin/overrides.json` | 商品上架状态/价格覆盖 | 后台 |
| `data/admin/imported-products.json` | 导入的商品 | 后台 |
| `data/admin/import-batches.json` | 导入批次（可回滚） | 后台 |
| `data/admin/followups.json` | 回访进度 | 后台 |
| `data/admin/settings.json` | 商店设置 | 后台 |
| `data/admin/admins.json` | 管理员账号 | 后台/seed |
| `data/admin/audit.jsonl` | 操作审计 | 后台 |
| `data/imports/` | 批量导入工作区 | 人工放置 |

## 约束
- 所有写操作写 `data/admin/audit.jsonl`（操作人、对象、内容）
- 删除一律**软删除**（`archived`），可恢复；导入批次可整体回滚
- 批量操作支持「按当前筛选结果全选」
- 会话密钥：环境变量 `ADMIN_SESSION_SECRET`（生产必须覆盖开发默认值）
