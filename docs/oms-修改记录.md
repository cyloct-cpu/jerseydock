# OMS 物流对接 · 修改记录(第一期)

> 2026-10-24 实现。对应方案:[oms-物流对接方案.md](./oms-物流对接方案.md) + [oms-订单管理页设计.md](./oms-订单管理页设计.md)。
> **回退方式见文末。** 所有改动也进了 git(仓库 2026-10-24 初始化,首个提交即本次实现后的全量参考点)。

## 一、功能开关(最快的"回退")

**后台 → 设置 → OMS 代发 · 关闭「启用 OMS 代发」开关并保存**:

- 后台 worker 空转(不再推送、不再拉轨迹);
- 订单页「推送 OMS / 重试推送」按钮会提示 OMS 未启用;
- 前台下单照常(队列只写入文件不被消费,无副作用);
- 款项状态徽章/筛选照常显示(纯本地推导,不依赖 OMS)。

即:关开关 = 回到改造前的手工发货流程,且数据无损。

## 二、新增文件(删除即回退对应功能)

| 文件 | 作用 |
|---|---|
| `packages/shared/src/oms/index.ts` | OMS API 客户端:配置模型、统一请求({Code,Msg,Data} 归一)、直发下单 payload 组装(国家名→ISO2 映射、COD 金额、重量估算)、轨迹状态→履约状态映射 |
| `apps/web/src/lib/oms-queue.ts` | 前台推送队列读写(data/oms/push-queue.jsonl)与入队 |
| `apps/web/src/app/api/i18n/mt/route.ts` | 动态文本机翻端点(轨迹事件按客户语言翻译,缓存 data/mt-cache/events-{locale}.json) |
| `apps/web/src/components/TrackEvents.tsx` | 前台轨迹时间轴组件(非英语客户自动机翻显示) |
| `apps/admin/src/lib/oms.ts` | 后台核心:配置读取、队列消费(创建直发单→单号回写→面单下载)、轨迹批量同步(状态升级+事件合并+COD 签收事件)、渠道/仓库缓存、进程内 worker |
| `apps/admin/src/lib/money-state.ts` | 款项状态模型:10 种状态推导 + 未付款原因归因 + 快捷筛选定义 |
| `apps/admin/src/app/api/oms/dispatch/route.ts` | 手动推送/重试(POST orderNos) |
| `apps/admin/src/app/api/oms/track-sync/route.ts` | 手动触发轨迹同步 |
| `apps/admin/src/app/api/oms/label/[orderNo]/route.ts` | 本地面单 PDF 输出(打印) |
| `apps/admin/src/app/api/oms/reference/route.ts` | 渠道/仓库列表缓存读取/刷新 |
| `apps/admin/src/components/OmsSyncButton.tsx` | 「同步 OMS 轨迹」按钮 |
| `apps/admin/src/components/OmsRefreshButton.tsx` | 设置页「拉取渠道/仓库」按钮 |

## 三、修改文件(含改动点说明)

| 文件 | 改动 |
|---|---|
| `packages/shared/src/index.ts` | 末尾追加 `export * from './oms'` |
| `apps/web/src/app/checkout/CheckoutClient.tsx` | 表单新增 `phone` 字段(必填,登录用户自动预填账户电话) |
| `apps/web/src/app/api/orders/route.ts` | 接收并校验 `phone`(必填,落订单顶层);**COD 订单创建后自动入 OMS 推送队列** |
| `apps/web/src/lib/payment.ts` | `markOrderPaid`(支付回调)成功后入 OMS 推送队列(先付款后发货模式) |
| `apps/web/src/components/OrderDetailView.tsx` | 轨迹时间轴改用 `TrackEvents` 组件(支持按语言机翻) |
| `apps/admin/src/lib/actions.ts` | ① `setOrderPayment` 标记已支付后自动入推送队列;② 新增 `setCodCollected`(标记回款)/`setCodCollectedBulk`(批量回款)/`setCodRefused`(标记拒收)/`pushOrdersToOms`(推送,可补填电话)/`retryOmsPush`(重试)/`saveOmsSettings`(OMS 配置独立表单) |
| `apps/admin/src/instrumentation.ts` | 保留原代理逻辑;新增 Node 运行时下启动 OMS worker(每分钟消费队列、每 30 分钟拉轨迹,globalThis 防重复) |
| `apps/admin/src/app/orders/page.tsx` | **整页重构**:新增统计卡(COD待回款/签收超期/推送失败/本月已回款)、快捷筛选 chips、筛选栏升级(款项状态/支付方式/履约+伪选项/时间)、「款项」列(徽章+原因+标记回款/标记拒收/标记已支付)、「物流」列(最新轨迹)、「操作」列按状态出按钮(推送/重试/打印面单/管理轨迹/客户链接/手工发货折叠) |
| `apps/admin/src/components/OrdersBulkBar.tsx` | 批量条扩展:批量推送 OMS、批量标记回款(勾选单号同步到隐藏表单提交) |
| `apps/admin/src/app/shipping/page.tsx` | 头部加「同步 OMS 轨迹」按钮 |
| `apps/admin/src/app/settings/page.tsx` | 新增「OMS 代发 · 物流服务商绑定」配置卡(独立表单,不影响其他设置区块) |
| `apps/admin/src/app/api/export/route.ts` | 订单 CSV 新增 phone / moneyState / moneyReason / payMethod 列 |

## 四、数据结构变化(全部向后兼容,无迁移)

订单(orders.jsonl)新增可选字段:

- `phone` —— 新订单由 checkout 写入;历史订单在推送时行内补填;
- `codConfirmedAt` —— 标记回款时间;
- `oms` —— `{ orderType, orderId, orderNumber, trackingNumber, serviceCode, ogId, pushedAt, labelPath, pushError, awaitingNumber, codEventAdded, lastTrackStatus, lastTrackAt, trackSyncedAt }`。

新增数据目录:

- `data/oms/push-queue.jsonl` —— 推送队列(`{orderNo, enqueuedAt, attempts, state: pending|done|failed, lastError}`);
- `data/oms/cache-channels.json` / `cache-warehouses.json` —— 渠道/仓库缓存;
- `data/labels/{订单号}.pdf` —— 本地留存面单(服务商 URL 只保留 20 天);
- `data/mt-cache/events-{locale}.json` —— 轨迹文本翻译缓存。

## 五、自动化流程(启用后生效)

1. COD 订单:前台下单 → 立即入队 → worker 每分钟推送 OMS(CreateLogisticsOrder,reference_no=KV 单号,幂等)→ 实时回写快递单号 + 下载面单 → 履约=已发货;
2. 在线/转账订单:支付回调或后台「标记已支付」→ 入队 → 同上;
3. 轨迹:worker 每 30 分钟批量 GetOrderTrack(≤100 单/批)→ 事件合并(英文入库,前台按语言机翻)、状态升级(已签收→delivered、拒收/丢件→exception)、COD 签收自动追加「待回款」事件;
4. 失败处理:单错误原因写 `oms.pushError` 行内可见,重试 5 次后队列标记 failed;异步取号渠道等待 30 分钟内自动补拉。

## 六、回退手段(按需选择)

1. **停用功能(推荐,秒级)**:设置 → OMS 代发 → 关闭开关。worker 停止、按钮失效,页面其余功能不受影响。
2. **整体撤回代码**:仓库已初始化 git,`git log` 找到本次实现提交,`git revert <commit>`(或对照本文档逐文件回退)。注意:**仓库在此前从未版本化,首个提交是"实现后"的全量参考点,不包含改造前基线**;因此逐文件回退请以上表"改动点说明"为准(新增文件直接删除;修改文件按说明还原对应代码段)。
3. **前台轨迹机翻单独回退**:`OrderDetailView.tsx` 中 `<TrackEvents …/>` 换回原内联渲染即可(组件独立,无其他耦合)。

## 七、上线前待办

1. 找服务商拿正式 `customer_code` / `customer_pwd`,填入 设置 → OMS 代发,开启开关,点「拉取渠道/仓库」核对 og_id 与 service_code;
2. 联调确认:COD 金额币种(当前按 totalUsd 直传)、渠道是否支持代收、结算周期(调整「签收超 N 天」阈值);
3. 用一笔测试订单走完整链路(推送→面单→轨迹→回款标记)。
