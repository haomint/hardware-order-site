<!-- 由 server/scripts/generate-api.mjs 生成。 -->
# 五金订货网站 · 阶段 B 接口契约草案

版本 `0.1.0-draft.1` · [OpenAPI 完整定义](./stage-b.openapi.json)

公开接口覆盖购物车刷新和提交订货单。订单详情、处理和导出仅对已登录管理员开放。下单成功页通过阶段 A 的 GET /api/shop 获取联系方式。

接口时间为 ISO 8601 UTC，页面按北京时间显示。日期筛选按订单创建时间，from 含、to 不含。选取整日或整月时，前端先按北京时间计算起止，再转为 UTC。

金额一律为整数分。商品单价为 null 表示价格面议。预估商品金额排除面议商品和运费。最终确认金额及收款标记由管理员独立维护。

后台接口沿用阶段 A 的 HttpOnly Cookie、成功请求滑动续期、写操作 Origin 校验。所有阶段 B 响应禁用缓存。

错误响应使用 { code, message }。INVALID_REQUEST 可附带 fieldErrors，以点号连接字段与数组下标，如 items.0.quantity。ORDER_PRODUCTS_UNAVAILABLE 附带 unavailableItems。

## 接口一览

| 接口 | 用途 | 登录 | 成功状态 |
| --- | --- | --- | --- |
| POST `/api/cart/items` | 批量刷新购物车商品 | 无需 | 200 |
| POST `/api/orders` | 提交订货单 | 无需 | 201 / 200 |
| GET `/api/admin/orders` | 查询后台订单 | 需要 | 200 |
| GET `/api/admin/orders/{orderNo}` | 查看订单详情 | 需要 | 200 |
| PATCH `/api/admin/orders/{orderNo}` | 处理订单与修改收款记录 | 需要 | 200 |
| GET `/api/admin/orders/export` | 按时间范围导出订单 CSV | 需要 | 200 |

## 行为约定

- **批量刷新购物车商品**　每个请求的 ID 对应一项，按输入顺序返回。available 和 out_of_stock 均返回当前公开商品信息（含价格和图片），后者不可下单。已下架、已删除和不存在统一返回 unavailable，只返回 ID 与状态。前端有本地商品名称时可显示名称，否则可显示「商品已不可订」。
- **提交订货单**　免登录，按访问者 IP 限流。服务端在同一写入事务中检查商品当前状态、按当前参考价重算金额、保存商品快照并生成唯一订单号。初始状态为待联系、未收款。 送货必须填写地址，自提保存为 null。已下架、已删除、不存在或缺货的商品全部列在 409 ORDER_PRODUCTS_UNAVAILABLE 中，整单拒绝。金额计算结果无法用安全整数表示时返回 409 ORDER_TOTAL_TOO_LARGE。 首次成功返回 201。同一个 Idempotency-Key 与相同的规范化请求重复提交（包括并发重试），返回 200 和原始回执，只保存一笔订单。成功后的重放优先于库存与价格检查，即使商品后来发生变化也返回原回执。 规范化包括去除文字首尾空白、UUID 小写、忽略自提地址、缺省备注视为空，商品行顺序不参与比较。已成功的键与订单一同保存，用于不同内容时返回 409 IDEMPOTENCY_KEY_CONFLICT。提交失败不占用键。客户端只在提交内容有意变更或开始一笔新订单时生成新键。 回执包含订单号、联系人、下单时间、商品快照和预估金额。服务端不提供免登录的订单查询接口。订单号日序号按北京时间的自然日递增，达到 9999 后当天的新单返回 500。
- **查询后台订单**　按 createdAt 倒序，同一时刻按 orderNo 倒序。状态、收款标记、时间和关键词同时给出时须全部满足。关键词可匹配订单号或手机号。分页超出范围时返回空 items，total 仍是匹配总数。
- **查看订单详情**　商品信息以快照为准，商品修改或删除后仍可查看。初始 updatedAt、状态与收款标记的修改时间等于创建时间。内部备注初始为空字符串，取消原因与最终确认金额初始为 null，这三项的修改时间在首次变更前为 null。
- **处理订单与修改收款记录**　省略的字段保持原值。多项修改一起成功或失败。允许的状态流转为 pending_contact → pending_payment、pending_fulfillment、cancelled。pending_payment → pending_fulfillment、cancelled。pending_fulfillment → completed、cancelled。completed → 无后续状态。cancelled → 无后续状态。重复设置当前状态视为无变化，其他非法流转返回 409 ORDER_STATUS_CONFLICT。 首次取消须同时提交非空 cancellationReason，前端先二次确认。已取消订单可单独修订原因。未取消订单单独提交原因时返回 409 ORDER_STATUS_CONFLICT。 收款标记可独立改为已收款或未收款，包括订单已完成或已取消时。状态流转不会自动改变收款标记，未收款也可以履约和完成。最终确认金额可填非负整数分或传 null 清除。 服务端只在值实际变化时更新对应字段的修改时间和 updatedAt。无变化时返回当前详情。
- **按时间范围导出订单 CSV**　from 和 to 必填。仅按创建时间范围筛选，返回全部匹配订单，排序与列表一致。无匹配项时返回只有表头的 CSV。 CSV 使用 UTF-8 BOM 和 CRLF，每行一笔订单。表头顺序为 orderNo、createdAt、contactName、phone、deliveryMethod、address、note、items、estimatedTotalCents、finalTotalCents、status、paymentStatus。 items 单元格为商品快照数组的 JSON 文本。金额用整数分，未记录的最终确认金额、自提地址输出空单元格。送货方式、状态和收款标记使用契约枚举值。 单元格按 CSV 规则转义。对可能被表格软件当作公式的用户输入文本加单引号前缀，包括忽略前导空白后以 =、+、- 或 @ 开头的内容。手机号按文本输出，避免 Excel 转换显示格式。

## 错误码

错误响应使用 `{ code, message }`。接口可能返回的错误码见 OpenAPI 中的对应响应。

| HTTP 状态 | code | 提示示例 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 请检查填写的内容后重试。 |
| 400 | `INVALID_ORIGIN` | 请从店铺后台页面操作。 |
| 401 | `UNAUTHENTICATED` | 请先登录。 |
| 429 | `TOO_MANY_REQUESTS` | 尝试次数过多，请稍后再试。 |
| 500 | `INTERNAL_ERROR` | 服务暂时不可用，请稍后再试。 |
| 404 | `ORDER_NOT_FOUND` | 找不到该订单。 |
| 409 | `ORDER_PRODUCTS_UNAVAILABLE` | 部分商品已下架、删除或缺货，请返回购物车调整。 |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | 这次提交与原订货单内容不同，请重新确认。 |
| 409 | `ORDER_STATUS_CONFLICT` | 当前订单状态不允许此修改，请刷新后重试。 |
| 409 | `ORDER_TOTAL_TOO_LARGE` | 预估商品金额过大，请联系店铺确认。 |
