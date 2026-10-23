# KITVAULT — 球衣跨境电商

> 品牌名与域名为占位值（`packages/shared/src/config/brand.ts`），确定后一处替换全站生效。

面向国际客户的球衣电商：前台商城 + 独立管理后台。

## 快速开始

```bash
npm install
npm run dev          # 前台商城  → http://localhost:3000
npm run dev:admin    # 管理后台  → http://localhost:3001（独立站点）
```

## 生产构建与启动

```bash
npm run build        # 双站生产构建（已验证通过）
npm run start        # 前台  → http://localhost:3000
npm run start:admin  # 后台  → http://localhost:3001
```

后台演示账号：`owner@kitvault.local` / `admin123`（首次登录后请修改；用户数据在 `data/admin/admins.json`）。

## 结构

| 路径 | 说明 |
|---|---|
| `apps/web` | 前台商城（顾客端） |
| `apps/admin` | 后台管理（独立站点，独立登录，N6） |
| `packages/shared` | 共享类型、品牌配置、货币、Provider 抽象、商品数据集 |
| `packages/db` | Prisma schema 与种子数据 |
| `data/` | 采集原始数据、批量导入工作区、导出 |
| `scripts/` | 采集、数据集构建、汇率同步、图片处理脚本 |
| `docs/开发执行文档.md` | **唯一执行依据**：需求、设计、进度 |

## 关键约定

- 价格一律以 **USD 基准**存储，展示层按汇率换算
- 排版以 **English 为设计基准语言**，其他语言仅翻译填充（N4）
- 设计规范见 `docs/设计规范.md`：素材 70% / 排版 20% / 动效 10%，动效克制（400–800ms、位移 8–24px）
- 第三方服务当前全部免费方案，见 `docs/开发执行文档.md` §6.8
- 商品数据为全量采集所得（3736 件），仅供开发测试，正式上线需替换自有授权素材
