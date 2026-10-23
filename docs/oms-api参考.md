# OMS(一件代发系统)API 参考

> 来源:ShowDoc《一件代发系统API目录》(item_id 2012922242579802),已核实服务器连通。
> 原始抓取的接口详情存于 `tmpwork/showdoc/*.md`(临时目录,本文档为准)。

## 基本约定

- **Base URL**: `http://oms.cfky888.com:7772`(注意是 **HTTP 明文**,端口 7772)
- **请求方式**: 全部 POST,`Content-Type: application/json`
- **鉴权**: 无签名/无 token,每个请求体里明文带 `customer_code`(客户代码)+ `customer_pwd`(密码)
- **统一响应**: `{ "Code": 1, "Msg": "执行成功", "Data": ..., "Data2": ... }`
  - `Code=1` 成功;`Code=0` 失败(看 Msg);`Code=2` 同参考单号已存在(见下文幂等)
- **参数禁忌**: 值里避免 `"` `&` `<` `>` 符号(对接必读明确要求)
- 已验证(2026-10-24,假账号):服务器在线,返回标准 JSON,错误信息为 `账号密码有误！`

## 接口清单

| 业务 | URL(POST) | 用途 |
|---|---|---|
| 创建直发订单 | `/api/OMSAPI/CreateLogisticsOrder` | 直发小包,系统分配跟踪号+面单 |
| 创建一件代发订单 | `/api/OMSAPI/createorder` | 海外仓 SKU 库存订单(需先建 SKU+入库) |
| 创建转寄订单 | `/api/OMSAPI/CreateReturnOrder` | 退件重出(引用退件单号) |
| 获取面单 | `/api/OMSAPI/CreateOrderLabel` | 按跟踪号取面单 PDF(可合并) |
| 轨迹跟踪 | `/api/OMSAPI/GetOrderTrack` | 批量查轨迹(≤100 个/次),中英文轨迹 |
| 查跟踪号/面单 | `/api/OMSAPI/GetTrackingNumber` | 异步取号后补拉单号/面单/状态 |
| 查询派送服务 | `/api/OMSAPI/getShippingMethod` | 渠道列表(service_code 下单用) |
| 查询仓库 | `/api/OMSAPI/GetWarehouse` | 仓库列表(og_id 下单用) |
| 拦截订单 | `/api/OMSAPI/BlockOrder` | 未出库订单可拦截(按 order_ids) |
| 取消拦截 | `/api/OMSAPI/CancelBlock` | 取消拦截 |
| 作废订单 | `/api/OMSAPI/CancelOrder` | 仓库未操作的订单可作废 |
| 查订单列表 | `/api/OMSAPI/GetOrderDetail` | 分页查订单(≤100/页),可按参考单号 |
| 创建 SKU | `/api/OMSAPI/createSKU` | 产品建档 |
| 查库存 | `/api/OMSAPI/GetInventory` | 在仓/锁定/可用/在途数量 |
| 创建代打包入库单 | `/api/OMSAPI/CreateWarehousing` | 国内仓入库(一箱一单) |
| 创建海外仓入库单 | `/api/OMSAPI/CreateHWCWarehousing` | 一件代发(Y)/整箱(Z)入库 |
| 查询入库单详情 | `/api/OMSAPI/GetInStockDetail` | 入库单状态 |
| 查询退件列表 | `/api/OMSAPI/GetReturnOrderList` | 分页查退件(转寄前置条件) |

> 注意:文档内 URL 写的是 `localhost:51812` 等本地示例,真实地址一律用上表 Base URL 拼接。

## 创建订单公共参数(直发 createorder/CreateLogisticsOrder 通用)

| 字段 | 必填 | 说明 |
|---|---|---|
| customer_code / customer_pwd | Y | 账号密码 |
| order_type | Y | 固定 `"A"`(转寄为 `"G"`) |
| reference_no | Y | **客户参考单号——用我们的 KV- 订单号,天然幂等键** |
| shipping_method | Y | 渠道代码,来自 getShippingMethod 的 service_code(如「日本佐川」「泰国KERRY」) |
| country_code | Y | 目的地二字码(TH/JP/TW…) |
| order_weight | Y | 预报重量 kg |
| platform | Y | 填「自建站」 |
| order_pieces | Y | 小包固定 1 |
| og_id | Y | 仓库 id(深圳=7,其余 GetWarehouse 查) |
| COD | Y | 代收金额,**无 COD 填 0,不能空** |
| shop / rmk / label_title / order_source / reference_no2 | N | 店铺/备注/面单标题/来源 |
| length / width / height | N | 长宽高 |
| print_phd | Y | 固定 false(不打印配货单) |

### Consignee 收件人对象

| 字段 | 必填 | 说明 |
|---|---|---|
| consignee_name | Y | 收件人姓名 |
| consignee_telephone | Y | 电话 |
| consignee_street | Y | 地址 1(street2/street3 可续) |
| consignee_city / consignee_province | Y | 城市/省 |
| consignee_district | 东南亚必填 | 区 |
| consignee_postcode | Y | 邮编 |
| consignee_email | 欧洲渠道必填 | 邮箱 |
| consignee_taxno / consignee_doorplate / 证件三件套 | 条件必填 | 欧洲/巴西等 |

### ItemArr 商品行

| 字段 | 必填 | 说明 |
|---|---|---|
| invoice_enname / invoice_cnname | Y | 品名英/中 |
| invoice_weight | Y | 单件重量 |
| invoice_quantity | Y | 数量 |
| invoice_unitcharge | Y | 单价 |
| invoice_currencycode | N | 币种(USD) |
| sku | N | SKU |
| image / invoice_material / hs_code | N | 图/材质/海关编码 |

## 创建成功返回(直发)

```json
{
  "Code": 1,
  "Msg": "执行成功",
  "Data": {
    "order_id": 409973,
    "ref_number": "KV-XXXX",
    "tracking_number": "TIIEP60221640",
    "label": "http://…/TIIEP60221640.pdf",   // 面单只保留 20 天!
    "label_status": "Y"    // Y=实时有面单; -1=异步取号,需调 GetTrackingNumber 补拉
  }
}
```

转寄返回:`{order_id, order_code(OMS订单号), refrence_no, shipping_method_no(跟踪号), label_url, order_status:"P"}`

**Code=2 的语义**:同参考单号+同国家+同渠道已存在 → 系统正常返回内容。即「重复提交」不报错,拿来即用;如收件人有改动需先作废再重报。

## 订单状态(order_status)

`P` 已预报 `B` 打包完成 `I` 分拣中 `S` 分拣完成 `O` 已出库 `R` 已核重 `Y` 缺货 `D` 作废

## 轨迹(GetOrderTrack)

- 请求:`{customer_code, customer_pwd, number: "单号1,单号2"(≤100,参考号/运单号/跟踪号均可)}`
- 返回 `Data[]`: `{no(参考号), number(订单号), oriNumber(跟踪号), destCountry, inDate(创建时间), newTrack(最新中文状态), newTrackDate, newTrackContext, events:[{time, location, content(中), en_content(英)}]}`
- 轨迹状态枚举:等待分拣/正在分拣/分拣完成/已出库/转运中/已上网/派送中/已签收/待取件/派送异常/异常/拒收/丢件/销毁/退件中/退件完成/待分拣

## 面单(CreateOrderLabel)

- 请求:`{customer_code, customer_pwd, tracking_number: "号1,号2", code:"", print_phd:"false"}`
- `code` 填了会替换为该自定义模板面单(不打印实际面单)
- 返回 `Data[]`: `{tracking_number, order_number, label(PDF URL), label_type:"PDF", product_code, ref_number}`
- **面单 URL 服务器只保留 20 天 → 必须下载落盘保存**

## 退件状态(GetReturnOrderList)

`I` 在途 `O` 已到仓 `S` 已上架未识别客户(不能转寄) `W` 已完成(可转寄) `T` 已建单待下架 `X` 已下架 `Y` 异常 `D` 已删除 `H` 已销毁 `F` 已出库 `J` 到期下架 `G` 申请销毁
转寄订单 ItemArr 填 `{return_order_number(退件单号), rmk}`,退件须处于 `W`。

## 已知坑位(对接时注意)

1. 文档示例 JSON 里混着中文注释、中文逗号、缺引号——**示例不能直接照抄**,以字段表为准;真实请求要发干净 JSON。
2. 所有查询接口文档的「失败示例」其实是复制的成功示例,别被误导;以 `Code` 字段判断。
3. GetInventory 的示例里 customer_pwd/customer_code 位置写反了,实际按名字传。
4. createSKU 文档只给了 query 参数形式,真实应 POST JSON,联调时确认。
5. 明文 HTTP + 账号密码 → 只能在服务端调用,严禁暴露给浏览器/日志。
