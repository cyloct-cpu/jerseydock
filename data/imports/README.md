# data/imports — 批量导入工作区（需求 N3）

每个「系列」一个文件夹，后台 `/products/import` 选择后解析导入：

```
data/imports/
├─ <系列名>/
│  ├─ products.csv        产品清单（必需；支持 products.json 替代）
│  ├─ images/<SKU>/       本地图片（可选，与 image_urls 二选一）
│  │  ├─ 1.jpg 2.jpg …
│  └─ meta.json           可选：默认分类、标签、版本
└─ SAMPLE-2026-27/        示例（含真实商品数据，可直接试导入）
```

清单字段见 `SAMPLE-2026-27/products.csv` 表头；导入后默认草稿，需在后台商品列表勾选上架。
