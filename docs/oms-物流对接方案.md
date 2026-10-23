# KITVAULT × OMS 物流系统对接方案

> 2026-10-24 · 基于已核实的 OMS API(见 [oms-api参考.md](./oms-api参考.md))与项目现状摸底。
> 结论先行:**采用「支付后自动推送、服务端直连、文件存储兼容」的方案,照抄 17TRACK 已验证的对接模式,分四期落地。第一期实现全自动闭环:订单支付成功 → 自动上传 OMS → 实时拿回快递单号+面单 → 轮询轨迹回写后台与前台。**

## 0. 目标形态(已确认)

用户下单并支付后,无需人工操作,自动完成:

```
前台下单支付成功(web 回调)
   → 写入推送队列 data/oms/push-queue.jsonl
   → admin 后台进程(每分钟)消费队列:调 CreateLogisticsOrder 预报
      (reference_no = KV-订单号,幂等,可无限重试)
   → OMS 实时返回 快递单号 + 面单 PDF(异步渠道数分钟后经 GetTrackingNumber 补拉)
   → 自动写 order.oms + shipment{carrier=渠道, trackingNo} → 履约状态=已发货
   → 面单 PDF 下载到 data/labels/ 供打印
   → admin 进程(每30-60分钟)批量调 GetOrderTrack 拉轨迹
   → 轨迹回写 shipment.events,状态自动流转 in_transit / delivered / exception
   → 后台订单管理列表、前台游客/账户订单页直接可见轨迹
```

后台订单管理页对应变化:履约状态新增「待推送/已推送/推送失败(含原因)」;发货操作列的快递单号由系统自动填充(替代手工 batchShip),「管理轨迹」弹窗显示 OMS 中英文轨迹;推送失败的订单显示原因并给「重试推送」按钮。手工发货入口保留,作为 OMS 故障时的降级。

触发时机按支付方式:线上支付=支付回调成功后入队;货到付款 COD=下单即入队(OMS COD 字段带代收金额);转账=后台点「标记已支付」时入队。

---

## 1. 这套 OMS 是什么,和我们是什么关系

OMS(`oms.cfky888.com:7772`)是服务商的「一件代发/海外仓系统」(TWMS),承担**从预报订单到出库、面单、轨迹**的全链路。对接后 KITVAULT 的角色变化:

| 环节 | 现状 | 对接后 |
|---|---|---|
| 发货 | 后台人工填 carrier + trackingNo(`shipOrder`/`batchShip`) | 后台一键预报 OMS,自动拿跟踪号 |
| 面单 | 无 | OMS 返回 PDF,系统下载留存、后台打印 |
| 轨迹 | 17TRACK 同步(外部聚合) + 手工时间轴 | OMS 直连轨迹(权威、中英文),17TRACK 保留做兜底 |
| 退件 | 无 | 可查退件状态、创建转寄(重发)订单 |

三种下单模式对应我们的三种业务:

1. **直发订单 `CreateLogisticsOrder`** —— 国内仓(深圳 og_id=7)直发小包给终端客户。**适合当前球衣现货直发,第一期就接这个。**
2. **一件代发 `createorder`** —— 货先入服务商海外仓(走 CreateHWCWarehousing 入库单),订单从海外仓库存出。**适合以后做本地化时效,第二期。**
3. **转寄订单 `CreateReturnOrder`** —— 退件到仓后重发给新地址。**按需第三期。**

## 2. 关键约束(决定了方案的形状)

1. **无回调/webhook** —— 轨迹和订单状态只能**轮询**(GetOrderTrack 支持 ≤100 单号/次批量,轮询成本可控)。
2. **鉴权=明文账密** + **明文 HTTP** —— 所有调用必须收敛在服务端(仅 admin 的 API route / server action),账密存 `data/admin/settings.json` 或 admin 的 `.env.local`,绝不进前端、不打日志。
3. **面单 URL 只保留 20 天** —— 拿到面单必须立即下载到 `data/labels/` 留存,页面只用本地文件。
4. **`reference_no` 是天然幂等键** —— 用我们的 `KV-xxxx` 订单号;重试/重复提交返回 `Code=2` 且照常返回单号,按成功处理即可。
5. **必填字段缺口:收件人电话**。OMS 的 `consignee_telephone` 必填,而我们的 checkout 表单**没有电话输入**(`CheckoutClient.tsx` 里只有个未使用的 `phone?` 类型声明,`/api/orders` 也不接收)。必须补:checkout 加电话字段(必填校验),历史订单在后台发货时可手填电话。
6. **预报重量必填** —— 商品数据里没有重量。第一期在 admin 设置里配「商品默认重量 kg」,按 `qty` 求和;后台发货弹窗允许临场改重。
7. 渠道代码是**中文名**(如「日本佐川」「泰国KERRY」),从 `getShippingMethod` 实时拉取做下拉,不在代码里写死。

## 3. 与现有代码的对接点(摸底结论)

| 现有资产 | 位置 | 复用方式 |
|---|---|---|
| 17TRACK 同步模式 | `apps/admin/src/lib/tracking17.ts` + `src/app/api/tracking17/sync/route.ts` + `SyncButton.tsx` | **照抄**:独立 lib client(settings.json 优先、env 兜底读 key;文件缓存;失败回落)+ admin API route + 触发按钮 |
| 发货入口 | `apps/admin/src/lib/actions.ts` 的 `shipOrder`(L804)/`batchShip`(L827) | OMS 预报成功后直接调用等价逻辑写 `shipment`,fulfillmentStatus→`shipped` |
| shipment 结构 | orders.jsonl 内嵌 `{carrier, trackingNo, status, events[]}` | OMS 的跟踪号写 `trackingNo`、渠道写 `carrier`,轨迹 events 直接映射,前台订单页自动显示,**前端零改动** |
| ShippingProvider 接口 | `packages/shared/src/shipping/index.ts` | 新增 `OmsShipping` 实现其 `fetchTracking()`;创建订单/面单超出现接口范围,放 admin lib |
| 密钥配置模式 | settings.json 顶层键 + env 兜底 | 新增 `oms` 键:`{customerCode, customerPwd, defaultOgId, defaultWeightKg, enabled}` |
| 权限 | `shipping.view / shipping.edit` 已存在 | 直接挂用 |

**数据存储**:继续走 orders.jsonl(与现状一致),订单对象新增可选字段 `oms`(见 §4)。等迁移 PostgreSQL 时这些字段平移到 Shipment 表即可,不做双写。

## 4. 数据模型扩展(向后兼容)

```ts
// order 新增可选字段(无 oms 字段 = 未走 OMS,老数据不受影响)
type OrderOms = {
  orderType: 'direct' | 'wms' | 'return';   // 直发/一件代发/转寄
  orderNumber?: string;                      // OMS 订单号 order_code
  orderId?: number;                          // OMS 内部 order_id(拦截/作废用)
  serviceCode: string;                       // 渠道,如「日本佐川」
  ogId: number;                              // 发货仓
  labelPath?: string;                        // 本地留存面单 data/labels/KV-xxxx.pdf
  lastStatus?: string;                       // OMS 订单状态 P/B/I/S/O/R/Y/D
  trackSyncedAt?: string;
  consigneePhone?: string;                   // 预报用电话(历史订单后台补填)
 declaredWeightKg?: number;                 // 预报重量
}
```

轨迹状态 → fulfillmentStatus 映射(写进 shipment.status / order.fulfillmentStatus):

- 已签收 → `delivered`
- 派送异常/异常/拒收/丢件/销毁 → `exception`
- 已上网/派送中/转运中/已出库/待取件 → `in_transit`
- 等待分拣/待分拣/分拣中… → `shipped`(或保持)

轨迹事件文本语言:OMS 每条事件带中文 `content` 和英文 `en_content`。`shipment.events.description` 存**英文**——站点是 29 语言全球站,机翻管线(`lib/mt.ts`)源语言就是 en,存英文文本即可翻向任意语言;轨迹状态词(newTrack)另存中文供后台归因与筛选。前台展示:客户语言为 en/zh 或词典命中的语言时直接显示;其余语言将事件文本经现成 MT 管线按需翻译(en→客户语言,结果磁盘缓存,一次翻译永久复用),轨迹文本天然重复率高,缓存命中后零 API 消耗。

## 5. 分期实施计划

### 第一期:全自动直发闭环(核心,~1.5 周)

**新增文件:**
- `packages/shared/src/oms/index.ts` —— OMS API client(web 与 admin 共用):统一 `omsRequest(path, body)`(fetch、15s 超时、{Code,Msg,Data} 归一化、账密从 `data/admin/settings.json` 的 `oms` 键读);函数:`getShippingMethods() / getWarehouses() / createDirectOrder(payload) / getOrderLabel(trackings) / getOrderTrack(numbers) / getTrackingNumber(number) / cancelOrder(ids) / blockOrder(ids)`;渠道与仓库列表带 1h 文件缓存(`data/oms/cache-*.json`)。
- `apps/web/src/lib/oms-queue.ts` —— 入队函数;在支付回调 `markOrderPaid`(apps/web/src/lib/payment.ts)与 COD 下单路由调用,写 `data/oms/push-queue.jsonl`(只入队,不直接调 OMS,保证回调快、可重试)。
- `apps/admin/src/lib/oms-worker.ts` —— admin 进程内定时器:每分钟消费推送队列(调 CreateLogisticsOrder → Code 1/2 视为成功 → label_status=-1 时延迟补拉 GetTrackingNumber → 下载面单到 data/labels/ → 写 order.oms + shipment → 履约=shipped;失败记录原因留重试);每 30-60 分钟批量 GetOrderTrack 轨迹同步(≤100 单号/批,状态映射+events 去重合并)。
- `apps/admin/src/app/api/oms/dispatch/route.ts` —— POST 手动推送/重试指定订单(权限 shipping.edit),推送失败订单的后台按钮用。
- admin UI:
  - `orders` 页:履约状态徽章增加「待推送/已推送/推送失败」;失败行内显示 OMS 错误原因 +「重试推送」;未付款订单仍走原「标记已支付」(点击即入队);**订单管理页完整改造(COD 代收、款项筛选体系、统计卡、快捷筛选)见 [oms-订单管理页设计.md](./oms-订单管理页设计.md)**;
  - `shipping` 页:「同步轨迹」手动触发按钮 + 面单「打印」链接(本地 PDF);
  - settings 页:OMS 绑定配置块(customer_code / customer_pwd / 默认渠道下拉 / 默认仓库 / 默认重量 / 开关)。

**改动文件:**
- `apps/web/src/app/checkout/CheckoutClient.tsx` + `apps/web/src/app/api/orders/route.ts`:加 `phone` 字段(必填校验、落库)。
- `apps/admin/src/lib/actions.ts`:`shipOrder/batchShip` 保持不动(无 OMS 订单仍可手填),OMS 发货走新 route。
- settings 页加 OMS 配置块。

**验收**:演示订单在后台一键预报 → 拿到真实跟踪号 → 面单 PDF 落盘可打印 → 轨迹同步后前台游客订单页/账户订单页能看到中文+英文轨迹 → 状态自动流转到 in_transit/delivered。

### 第二期:稳健性与运营(~3 天)

- 定时轮询:admin 起个简单 setInterval 的内存调度或 Windows 计划任务 curl 触发 track-sync(无服务器托管环境,不上 cron 库);
- 失败重试与对账:`GetOrderDetail`(按日期分页)每天对一次,把 OMS 有但我们没单号的漏单补回来;
- 拦截/作废按钮:订单未出库前可在后台触发 `BlockOrder`/`CancelOrder`(用 oms.orderId);
- 批量发货:orders 列表多选 → 批量 OMS 预报(替代 batchShip 的 CSV 粘贴);
- 17TRACK 与 OMS 轨迹二选一策略:有 oms 字段走 OMS,否则走 17TRACK。

### 第三期:一件代发/海外仓(视备货模式,~1 周)

- 商品 handle ↔ OMS SKU 映射:产品页加映射配置,后台「同步 SKU 到 OMS」批量 `createSKU`;
- 入库:`CreateHWCWarehousing`(一件代发箱)建入库单,`GetInStockDetail` 跟踪入库状态;
- 库存展示:admin 商品列表拉 `GetInventory` 显示可用库存,低于阈值标红;可选:前台售罄判定接入;
- 下单切 `createorder`(海外仓出库),payload 与直发几乎同构,oms.ts 里只是换了函数。

### 第四期:退件转寄(按需,~3 天)

- admin 退件页:轮询 `GetReturnOrderList` 展示退件(状态 W 可操作);
- 一键转寄:`CreateReturnOrder`(引用 return_order_number + 新收件人),复用第一期的面单/轨迹链路。

## 6. 安全与容错清单

- 账密只存服务端(settings.json / env),API route 全部校验 admin session + `shipping.edit` 权限;
- 出网走 admin 已有的 `HTTP_PROXY` 配置(与 tracking17 同路);明文 HTTP 无法避免,但至少只发生在服务端→服务商之间;
- 幂等:预报重试直接重发同 reference_no,Code=2 视为成功;轨迹同步 merge 不覆盖已有事件;面单下载失败不阻塞发货,后台可单独重拉;
- 日志脱敏:请求体不打 customer_pwd;
- 边界:OMS 不可达时发货按钮降级为原来的手填模式(功能开关 `oms.enabled`)。

## 7. 待确认问题(开工前找服务商/自己定)

1. 正式 `customer_code` / `customer_pwd`;
2. 实际可用渠道清单与各自是否支持 COD(`getShippingMethod` 拿到后确认 `is_lable` 语义);
3. 货从哪个仓发(og_id=7 深圳仓?),有没有海外仓备货计划;
4. 是否需要 COD 代收(走线上支付就全填 0);
5. 商品重量默认值,定制款(armband/customText)是否影响计重;
6. 一件代发是否在近期路线图内(决定第三期优先级)。
