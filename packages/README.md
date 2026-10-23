# packages — 共享包

| 包 | 功能 | 说明 |
|---|---|---|
| `db/` | Prisma schema、迁移、种子数据 | 全项目唯一数据模型来源；价格一律 USD 基准存储 |
| `i18n/` | 语言包与邮件模板 | **English 为设计基准语言**，其他语言为翻译填充（N4） |
| `shared/` | 共享类型、品牌配置、货币与汇率、Provider 抽象 | 前后台共用，避免重复定义 |

## packages/shared 关键模块

| 路径 | 用途 |
|---|---|
| `src/config/brand.ts` | **品牌与域名占位**（N7）：`BRAND_NAME` / `STORE_DOMAIN` / `ADMIN_DOMAIN` / Logo，替换只改这里 |
| `src/currency/` | 货币列表、格式化、USD 基准换算、心理价位取整 |
| `src/payment/` | `PaymentProvider` 抽象 + `PlaceholderProvider`（N8，支付未开通） |
| `src/shipping/` | `ShippingProvider` 抽象 + 免费方案实现（N2） |
| `src/translate/` | `TranslateProvider` 抽象 + 免费方案实现（N1） |
| `src/types/` | Product / Order / Customer / Shipment 等共享类型 |

## 约定
- 前后台都从这里导入类型与配置，**不允许各自复制一份**
- Provider 一律先定义接口再实现，方便后续替换付费服务（更换时只改实现，不动业务代码）
- 语言包 key 命名遵循 `模块.元素`，如 `product.addToCart`
