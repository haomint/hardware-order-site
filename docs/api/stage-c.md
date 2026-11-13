<!-- 由 server/scripts/generate-api.mjs 生成。 -->
# 五金订货网站 · 阶段 C 提醒接口契约草案

版本 `0.1.0-draft.1` · [OpenAPI 完整定义](./stage-c.openapi.json)

沿用阶段 B 的后台订单路径。阶段 C 启用后，订单列表增加 notificationStatus，详情及修改订单的响应同时增加 notificationLastAttemptAt。响应中的其余订单字段与阶段 B 一致。

提醒状态只描述新订单提醒，涵盖自动重试、备用渠道和手动重发。任一渠道成功后为 sent。超时未处理的再次提醒单独记录，不改变这里的状态和尝试时间。

sent 为已发送，failed 为发送失败且当前没有自动重试待处理，retrying 为已排队、发送中或等待重试。 null 表示没有新订单提醒记录，例如旧订单。 最近一次实际尝试发送新订单提醒的 UTC 时间，尚未尝试时为 null。 通知变化不改动订单的 updatedAt、订单状态或收款标记。

后台接口沿用 HttpOnly Cookie、成功请求滑动续期、写操作 Origin 校验及禁用缓存。开发环境跨域直连时，允许的来源可在 CORS 预检中使用 Idempotency-Key。

## 接口一览

| 接口 | 用途 | 登录 | 成功状态 |
| --- | --- | --- | --- |
| GET `/api/admin/orders` | 查询后台订单 | 需要 | 200 |
| GET `/api/admin/orders/{orderNo}` | 查看订单详情 | 需要 | 200 |
| PATCH `/api/admin/orders/{orderNo}` | 处理订单与修改收款记录 | 需要 | 200 |
| POST `/api/admin/orders/{orderNo}/notifications/retry` | 手动重发新订单提醒 | 需要 | 202 |

## 行为约定

- **查询后台订单**　按 createdAt 倒序，同一时刻按 orderNo 倒序。状态、收款标记、时间和关键词同时给出时须全部满足。关键词可匹配订单号或手机号。每笔订单返回商品种类数 itemCount 及下单时前两种商品的名称和数量 itemsPreview。分页超出范围时返回空 items，total 仍是匹配总数。 notificationStatus 为 failed 时可在列表标记提醒发送失败。
- **查看订单详情**　商品信息以快照为准，商品修改或删除后仍可查看。初始 updatedAt、状态与收款标记的修改时间等于创建时间。内部备注初始为空字符串，取消原因与最终确认金额初始为 null，这三项的修改时间在首次变更前为 null。 同时返回新订单提醒状态和最后一次尝试时间。
- **处理订单与修改收款记录**　省略的字段保持原值。多项修改一起成功或失败。管理员可从任一状态改到其他任一状态，包含回退、跨步和恢复已取消订单。前端在设为已完成或已取消前二次确认。 提交 status=cancelled 时须同时填写非空 cancellationReason。从已取消改为其他状态时，保留最近一次取消原因和它的修改时间。已取消订单可以单独修订原因。未取消订单单独提交原因时返回 409 ORDER_STATUS_CONFLICT。显式指定其他状态又提交取消原因时，返回 400 INVALID_REQUEST 及该字段的错误提示。 收款标记可独立改为已收款或未收款，包括订单已完成或已取消时。状态流转不会自动改变收款标记，未收款也可以履约和完成。最终确认金额可填非负整数分或传 null 清除。 服务端只在值实际变化时更新对应字段的修改时间和 updatedAt。无变化时返回当前详情。
- **手动重发新订单提醒**　请求无正文。只有当前状态为 failed 的新订单提醒可重发。服务端须在同一事务中保存重发受理记录并将提醒置为 retrying，成功后返回 202。202 表示已受理，发送完成后刷新订单详情查看 sent 或 failed。 同一订单与同一 Idempotency-Key 已受理时，返回原 202 回执，不再次排队。此检查先于当前状态判断，因此发送结束后的网络重试仍返回原回执。未受理的请求不占用键。 不同键并发提交时只有一个请求能从 failed 进入 retrying，其余返回 409 NOTIFICATION_NOT_RETRYABLE。无提醒记录、已发送或处理中也返回该错误。订单不存在时返回 404，无法保存受理记录时返回 500。 前端只在 failed 时展示重发按钮，处理期间禁用按钮。一次点击生成一个键，网络重试沿用该键。确认上一轮处理结束并再次失败后，新的手动重发使用新键。

## 错误码

错误响应使用 `{ code, message }`。接口可能返回的错误码见 OpenAPI 中的对应响应。

| HTTP 状态 | code | 提示示例 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 请检查填写的内容后重试。 |
| 400 | `INVALID_ORIGIN` | 请从店铺后台页面操作。 |
| 401 | `UNAUTHENTICATED` | 请先登录。 |
| 500 | `INTERNAL_ERROR` | 服务暂时不可用，请稍后再试。 |
| 404 | `ORDER_NOT_FOUND` | 找不到该订单。 |
| 409 | `ORDER_STATUS_CONFLICT` | 订单尚未取消，无法单独修改取消原因。 |
| 409 | `NOTIFICATION_NOT_RETRYABLE` | 只有发送失败且未在处理中的提醒可以重发，请刷新订单查看。 |
