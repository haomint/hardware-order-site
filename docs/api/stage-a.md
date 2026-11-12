<!-- 由 server/scripts/generate-api.mjs 生成。 -->
# 五金订货网站 · 阶段 A 接口契约

版本 `0.1.0` · [OpenAPI 完整定义](./stage-a.openapi.json)

覆盖公开店铺资料、商品目录、后台分类与商品管理、管理员会话和图片上传。

商品列表使用 page、pageSize 和 { items, total }。页码超过范围时 items 为空。分类列表一次返回全部匹配分类，格式仍为 { items, total }，其中 total 等于 items.length。

列表查询参数只接受文档列出的单值字段。请求体的未知字段视为参数错误。PATCH 省略的字段保持原值。

商品参考单价用整数分。priceCents 为 null 时显示「价格面议」。品牌和型号未填写时返回空字符串，前台隐藏相应项。新增时可以省略，编辑时传空字符串可清空。已上架商品可以同时缺货。

生产环境同源访问，后台使用 HttpOnly、Secure、SameSite=Lax、Path=/ 的 Cookie。后台写操作校验 Origin。开发环境可通过环境配置加入前端开发服务器的完整来源。跨端口直连时仅对配置的来源开放带凭据的 CORS，前端请求使用 credentials: include。仅本地 HTTP 开发可省略 Cookie 的 Secure 属性。

登录成功后会话有效期为 30 天。每次需登录的后台接口成功返回时，从本次请求起重新计算 30 天有效期，同时续发 Cookie。会话到期或主动退出后需重新登录。会话和后台数据禁止缓存。

公开商品目录应重新验证或禁用缓存，使上下架、缺货和删除变更及时生效。图片以同源根路径公开静态访问，使用不可猜测的随机文件名，可长期缓存。替换图片时使用新路径，源站清理图片后客户端可能仍持有旧缓存。

INVALID_REQUEST 可以附带 fieldErrors。键为字段路径，如 name 或 detailImageIds.0，数组下标从 0 开始。值为简体中文提示。无法定位字段时使用 message。

## 接口一览

| 接口 | 用途 | 登录 | 成功状态 |
| --- | --- | --- | --- |
| GET `/api/shop` | 查看店铺资料 | 无需 | 200 |
| GET `/api/categories` | 查看分类 | 无需 | 200 |
| GET `/api/products` | 浏览和搜索商品 | 无需 | 200 |
| GET `/api/products/{id}` | 查看商品详情 | 无需 | 200 |
| POST `/api/admin/login` | 登录后台 | 无需 | 200 |
| GET `/api/admin/session` | 检查管理员登录状态 | 需要 | 200 |
| POST `/api/admin/logout` | 退出后台 | 无需 | 204 |
| GET `/api/admin/categories` | 查看后台分类列表 | 需要 | 200 |
| POST `/api/admin/categories` | 新增分类 | 需要 | 201 |
| PATCH `/api/admin/categories/{id}` | 改名或调整分类排序 | 需要 | 200 |
| DELETE `/api/admin/categories/{id}` | 删除空分类 | 需要 | 204 |
| GET `/api/admin/products` | 查看和搜索后台商品 | 需要 | 200 |
| GET `/api/admin/products/{id}` | 查看后台商品详情 | 需要 | 200 |
| POST `/api/admin/products` | 新增商品 | 需要 | 201 |
| PATCH `/api/admin/products/{id}` | 编辑商品、变更上架及缺货状态、维护图片 | 需要 | 200 |
| DELETE `/api/admin/products/{id}` | 删除商品 | 需要 | 204 |
| POST `/api/admin/images` | 上传单张商品图片 | 需要 | 201 |

## 行为约定

- **查看店铺资料**　返回店名 name、联系电话 phone 和客服微信引导文案 wechatContactText，均来自服务端部署配置。
- **查看分类**　一次返回所有至少关联一件上架商品的分类。已上架的缺货商品计入。按 sortOrder 升序，再按 createdAt 升序排列。排序值和创建时间均相同时按 id 升序稳定排列。
- **浏览和搜索商品**　只返回上架商品，包含缺货商品。分类和关键字可同时使用。列表使用 mainImage.thumbnailUrl。置顶优先，其后按 sortOrder 升序、createdAt 降序排列。前三项均相同时按 id 升序，保证分页稳定。
- **查看商品详情**　下架与不存在均返回 PRODUCT_NOT_FOUND。缺货商品仍返回详情。
- **登录后台**　验证账号和密码后签发新会话，响应体只返回账号。错误凭证使用同一提示。达到登录频率限制时返回 429。
- **检查管理员登录状态**　打开或刷新后台时检查会话，并在成功时续期。会话不存在或失效时返回 401。
- **退出后台**　注销现有会话并清除 Cookie。会话已过期或未登录时也返回 204。
- **查看后台分类列表**　一次返回所有分类，包含没有上架商品的分类。按 sortOrder 升序，再按 createdAt 升序排列。排序值和创建时间均相同时按 id 升序稳定排列。
- **新增分类**　分类名去除首尾空白后精确判重。
- **删除空分类**　有商品关联时返回 CATEGORY_IN_USE，关联的下架商品也计入。
- **查看和搜索后台商品**　默认包含上架、下架和缺货商品。筛选项同时提供时须全部匹配。置顶优先，其后按 sortOrder 升序、createdAt 降序排列。前三项均相同时按 id 升序，保证分页稳定。
- **新增商品**　默认下架、未缺货、未置顶。发布时必须有主图。图片字段使用上传接口返回的 ID。
- **编辑商品、变更上架及缺货状态、维护图片**　合并修改后校验完整商品。上架必须有主图，主图和详情图不得重复。将图片 ID 从 detailImageIds 移除即可解除详情图关联。主图可以替换，或在商品下架时通过 mainImageId=null 清空。移除的图片在没有商品引用时由服务端清理。
- **删除商品**　上架和下架商品均可永久删除。前端二次确认后发出请求。成功后商品从前后台目录移除，关联图片仅在无其他引用时清理。阶段 B 的订单必须在下单时保存商品快照，历史订单的展示和处理不依赖商品记录仍然存在。
- **上传单张商品图片**　用 FormData 的 file 字段上传。服务端检查实际格式、文件大小和解码像素数（最多 2400 万），仅接受静态 JPEG、PNG 或 WebP。手机 HEIC 由前端转为 JPEG 并压缩后上传。重新编码生成压缩图（长边最多 1600 像素）和缩略图（长边最多 480 像素），不保存原图。上传后用返回的 id 保存商品，24 小时未关联的图片可被清理。Nginx 的请求体限制需容纳 10 MiB 文件和 multipart 封装开销，例如在上传路径设 client_max_body_size 11m。

## 错误码

错误响应使用 `{ code, message }`。接口可能返回的错误码见 OpenAPI 中的对应响应。

| HTTP 状态 | code | 提示示例 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 请检查填写的内容后重试。 |
| 400 | `INVALID_ORIGIN` | 请从店铺后台页面操作。 |
| 400 | `INVALID_IMAGE` | 请选择符合要求且可以打开的图片。 |
| 401 | `UNAUTHENTICATED` | 请先登录。 |
| 401 | `INVALID_CREDENTIALS` | 账号或密码不正确。 |
| 404 | `CATEGORY_NOT_FOUND` | 找不到该分类。 |
| 404 | `PRODUCT_NOT_FOUND` | 找不到该商品。 |
| 404 | `IMAGE_NOT_FOUND` | 图片不存在或上传已失效，请重新上传。 |
| 409 | `CATEGORY_NAME_EXISTS` | 已有同名分类。 |
| 409 | `CATEGORY_IN_USE` | 该分类下还有商品，请先将商品移到其他分类。 |
| 429 | `TOO_MANY_REQUESTS` | 尝试次数过多，请稍后再试。 |
| 500 | `INTERNAL_ERROR` | 服务暂时不可用，请稍后再试。 |
