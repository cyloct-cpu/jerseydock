# data — 数据工作区

| 目录 | 用途 |
|---|---|
| `raw/` | 采集原始数据（站点地图、`products.json`、`products.csv`、`image-urls.txt`、`collection-map.json`）。**只读，不要手改** |
| `imports/` | 批量上品工作区。**一个款式/系列 = 一个文件夹** |
| `exports/` | 导出：订单、客户、回访名单、报表 |
| `assets/` | 图片处理工作区：统一背景、3:4 裁切、调色、压缩 |

## 批量导入目录约定（需求 N3）

```
data/imports/
└─ 2026-27_Barcelona/                 一个系列 = 一个文件夹（名称自取）
   ├─ products.xlsx                   产品清单（必需，也可 .csv / .json）
   ├─ images/                         图片（必需），按 SKU 建子目录
   │   ├─ BAR-2627-HOME-FAN/ 1.jpg 2.jpg 3.jpg 4.jpg
   │   └─ BAR-2627-AWAY-FAN/ 1.jpg 2.jpg 3.jpg 4.jpg
   └─ meta.json                       可选：默认分类、标签、版本、赛季
```

### products 清单字段
| 列名 | 必填 | 说明 |
|---|---|---|
| `sku` | 是 | 唯一标识；重复导入为更新，不重复建 |
| `title` | 是 | 商品标题（英文，设计基准语言） |
| `season` | 否 | 如 `2026-27` |
| `team` | 否 | 球队/国家队名 |
| `league` | 否 | 联赛 |
| `type` | 否 | `home / away / third / gk / training / retro` |
| `version` | 否 | `fan / player / kids` |
| `price_usd` | 是 | 基准价（USD） |
| `compare_price_usd` | 否 | 原价划线价 |
| `size_range` | 否 | `S-4XL`，默认 `S,M,L,XL,2XL` |
| `stock` | 否 | 默认 0 |
| `description` | 否 | 英文描述 |
| `image_folder` | 是 | 对应 `images/` 下的子目录名（通常等于 sku） |

### 导入规则
1. 导入后商品状态一律 `draft`（**未上架**），由你在列表勾选批量上架
2. 图片缺失 / SKU 重复 / 价格格式错误 → 预览表标红，该行不入
3. 每次导入生成 `ImportBatch` 记录，可查看日志、可回滚
4. 图片统一为 **3:4**、统一光源与背景（见 `docs/设计规范.md`）
