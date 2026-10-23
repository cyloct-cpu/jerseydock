# scripts — 脚本集合

| 脚本 | 用途 |
|---|---|
| `scrape-chenyikan.mjs` | **全量采集**参考站商品（遍历 138 个集合的 `products.json`），产出 `data/raw/` |
| `download-images.mjs` | 按 `data/raw/image-urls.txt` 下载图片到 `data/assets/`（可选，支持并发与断点续传） |
| `build-import-folders.mjs` | 把 `data/raw/products.csv` 按系列拆成 `data/imports/<系列>/` 结构，供后台批量导入 |
| `sync-exchange-rates.mjs` | 每日同步汇率（免费接口 frankfurter.app）写入 `ExchangeRate` |
| `process-images.mjs` | 图片批处理：统一 3:4 裁切、统一背景、压缩转 WebP |

## 运行方式
```bash
node scripts/scrape-chenyikan.mjs        # 全量采集商品
node scripts/download-images.mjs         # 可选：下载图片到本地
node scripts/build-import-folders.mjs    # 生成批量导入文件夹结构
```

## 说明
- 采集脚本带并发限制与重试，遵守 robots 友好频率（每页 120ms 间隔）
- 采集数据仅用于**开发测试与选品参考**；正式对外销售前需替换为自有或授权素材（版权风险）
- 所有脚本幂等：重复运行不会产生重复数据（按 handle/sku 去重）
