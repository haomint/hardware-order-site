<!-- 由 server/scripts/generate-api.mjs 生成。 -->
# 五金订货网站 · 阶段 A 接口契约

版本 `0.1.0` · [OpenAPI 完整定义](./stage-a.openapi.json)

覆盖公开及后台店铺资料、商品目录、分类与图标、首页轮播图、后台商品管理、管理员会话和图片上传。

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
| GET `/api/admin/shop` | 读取当前店铺资料 | 需要 | 200 |
| PATCH `/api/admin/shop` | 修改店铺资料 | 需要 | 200 |
| GET `/api/categories` | 查看分类 | 无需 | 200 |
| GET `/api/products` | 浏览和搜索商品 | 无需 | 200 |
| GET `/api/products/{id}` | 查看商品详情 | 无需 | 200 |
| POST `/api/admin/login` | 登录后台 | 无需 | 200 |
| GET `/api/admin/session` | 检查管理员登录状态 | 需要 | 200 |
| POST `/api/admin/logout` | 退出后台 | 无需 | 204 |
| GET `/api/admin/categories` | 查看后台分类列表 | 需要 | 200 |
| POST `/api/admin/categories` | 新增分类 | 需要 | 201 |
| PATCH `/api/admin/categories/{id}` | 修改分类名称、排序或图标 | 需要 | 200 |
| DELETE `/api/admin/categories/{id}` | 删除空分类 | 需要 | 204 |
| GET `/api/admin/products` | 查看和搜索后台商品 | 需要 | 200 |
| GET `/api/admin/products/{id}` | 查看后台商品详情 | 需要 | 200 |
| POST `/api/admin/products` | 新增商品 | 需要 | 201 |
| PATCH `/api/admin/products/{id}` | 编辑商品、变更上架及缺货状态、维护图片 | 需要 | 200 |
| DELETE `/api/admin/products/{id}` | 删除商品 | 需要 | 204 |
| POST `/api/admin/images` | 上传单张图片 | 需要 | 201 |
| GET `/api/banners` | 查看首页轮播图 | 无需 | 200 |
| GET `/api/admin/banners` | 查看后台轮播图 | 需要 | 200 |
| POST `/api/admin/banners` | 新增轮播图 | 需要 | 201 |
| PATCH `/api/admin/banners/{id}` | 修改轮播图及显示顺序 | 需要 | 200 |
| DELETE `/api/admin/banners/{id}` | 删除轮播图 | 需要 | 204 |

## 行为约定

- **查看店铺资料**　返回当前保存的店名 name、联系电话 phone 和客服微信引导文案 wechatContactText，响应结构沿用 ShopSchema。后台保存成功后，下一次请求即读取新资料。响应使用 Cache-Control: no-store。
- **读取当前店铺资料**　与公开接口读取同一份已保存的资料。首次启动且数据库还未保存资料时，用 SHOP_NAME、SHOP_PHONE 和 SHOP_WECHAT_CONTACT_TEXT 初始化并持久化。缺省值依次为「威马五金」、空字符串、空字符串。资料一旦保存，重启或修改环境变量不会覆盖它。成功响应续期，且禁止缓存。
- **修改店铺资料**　用 application/json 提交至少一个字段。三项都只接受字符串并去除首尾空白。店名必有内容，最多 100 个字符。 联系电话最多 50 个字符，允许区号，只能填数字、普通空格、加号、减号和英文圆括号。此字符限制用于后台提交。 客服微信引导文案为最多 300 个字符的纯文本，允许换行。保留正文内部的换行，商城按原样分行显示。 传空字符串可清空联系电话或引导文案，省略字段保持原值。未知字段、空请求对象及 null 均返回 INVALID_REQUEST，字段校验错误附中文 fieldErrors。 所有字段校验后一次保存，成功返回完整资料。保存失败返回 INTERNAL_ERROR。
- **查看分类**　一次返回所有至少关联一件上架商品的分类。已上架的缺货商品计入。按 sortOrder 升序，再按 createdAt 升序排列。排序值和创建时间均相同时按 id 升序稳定排列。 iconUrl 返回方形缩略图。未设置或图片不可用时返回 null，商城使用内置图标。
- **浏览和搜索商品**　只返回上架商品，包含缺货商品。分类和关键字可同时使用。列表使用 mainImage.thumbnailUrl。置顶优先，其后按 sortOrder 升序、createdAt 降序排列。前三项均相同时按 id 升序，保证分页稳定。
- **查看商品详情**　下架与不存在均返回 PRODUCT_NOT_FOUND。缺货商品仍返回详情。
- **登录后台**　验证账号和密码后签发新会话，响应体只返回账号。错误凭证使用同一提示。达到登录频率限制时返回 429。
- **检查管理员登录状态**　打开或刷新后台时检查会话，并在成功时续期。会话不存在或失效时返回 401。
- **退出后台**　注销现有会话并清除 Cookie。会话已过期或未登录时也返回 204。
- **查看后台分类列表**　一次返回所有分类，包含没有上架商品的分类。按 sortOrder 升序，再按 createdAt 升序排列。排序值和创建时间均相同时按 id 升序稳定排列。 iconUrl 可用来预览已保存的图标，未设置或图片不可用时为 null。
- **新增分类**　分类名去除首尾空白后精确判重。 可省略 iconImageId 或传 null，表示不设置图标。iconImageId 使用上传接口返回的 ID。服务端校验关联图片可用且宽高相等。图片不存在或上传已失效时返回 IMAGE_NOT_FOUND。图片可用但不是方形时返回 INVALID_REQUEST，fieldErrors.iconImageId 为中文提示。
- **修改分类名称、排序或图标**　PATCH 省略 iconImageId 时保留旧图标，传 null 清除，传新 ID 替换。iconImageId 使用上传接口返回的 ID。服务端校验关联图片可用且宽高相等。图片不存在或上传已失效时返回 IMAGE_NOT_FOUND。图片可用但不是方形时返回 INVALID_REQUEST，fieldErrors.iconImageId 为中文提示。图片只有在商品、分类图标和轮播图都不再引用时才可清理。
- **删除空分类**　有商品关联时返回 CATEGORY_IN_USE，关联的下架商品也计入。 有轮播图关联时返回 CATEGORY_HAS_BANNERS，隐藏中的轮播图也计入。两种引用同时存在时优先返回 CATEGORY_IN_USE。删除成功后解除图标引用。图片只有在商品、分类图标和轮播图都不再引用时才可清理。
- **查看和搜索后台商品**　默认包含上架、下架和缺货商品。筛选项同时提供时须全部匹配。置顶优先，其后按 sortOrder 升序、createdAt 降序排列。前三项均相同时按 id 升序，保证分页稳定。
- **新增商品**　默认下架、未缺货、未置顶。发布时必须有主图。图片字段使用上传接口返回的 ID。
- **编辑商品、变更上架及缺货状态、维护图片**　合并修改后校验完整商品。上架必须有主图，主图和详情图不得重复。将图片 ID 从 detailImageIds 移除即可解除详情图关联。主图可以替换，或在商品下架时通过 mainImageId=null 清空。图片只有在商品、分类图标和轮播图都不再引用时才可清理。
- **删除商品**　上架和下架商品均可永久删除。前端二次确认后发出请求。成功后商品从前后台目录移除，关联图片仅在无其他引用时清理。阶段 B 的订单必须在下单时保存商品快照，历史订单的展示和处理不依赖商品记录仍然存在。
- **上传单张图片**　用 FormData 的 file 字段上传。服务端检查实际格式、文件大小和解码像素数（最多 2400 万），仅接受静态 JPEG、PNG 或 WebP。手机 HEIC 由前端转为 JPEG 并压缩后上传。重新编码生成压缩图（长边最多 1600 像素）和缩略图（长边最多 480 像素），不保存原图。 可用返回的 id 关联商品、分类图标或轮播背景。上传后 24 小时未关联的图片可被清理。Nginx 的请求体限制需容纳 10 MiB 文件和 multipart 封装开销，例如在上传路径设 client_max_body_size 11m。 分类图标建议裁成 480 × 480 像素方图后上传。轮播背景建议 1600 × 800 像素，比例约 2:1，重要内容留在中间。服务端保留原比例，商城和后台预览按容器居中裁剪铺满，标题和按钮由页面叠放在图片上。
- **查看首页轮播图**　不分页。只返回 isVisible 为 true、背景图可用、目标分类存在且至少有一件上架商品的轮播图。已上架的缺货商品也计入。点击按 categoryId 进入商品列表。按 sortOrder 升序、createdAt 升序、id 升序排列。 无可展示图片时返回空列表，首页继续使用内置示例图。响应禁止缓存。
- **查看后台轮播图**　不分页，显示和隐藏的轮播图均返回。按 sortOrder 升序、createdAt 升序、id 升序排列。 isVisible 表示已保存的显示开关。目标分类无上架商品时仍保留设置。若背景文件已不可用，backgroundImageUrl 为 null，可换图或删除该记录。
- **新增轮播图**　必须提供可用背景图的 backgroundImageId 和已存在的 categoryId。 title 最多 16 字符，description 最多 30 字符，均可留空。 buttonText 为 1 至 6 字符，默认为「去看看」。三项均为单行纯文本并去除首尾空白。 默认隐藏，sortOrder 默认为 0。最多保存 5 张，隐藏图也计入。
- **修改轮播图及显示顺序**　至少提交一个字段，省略项保留。可只传 sortOrder 调整顺序，范围为 0 至 9999。按 sortOrder 升序、createdAt 升序、id 升序排列。 更换目标分类时须存在，更换图片或设置 isVisible=true 时须有可用背景图。已损坏的图片可换图或关闭显示。图片只有在商品、分类图标和轮播图都不再引用时才可清理。
- **删除轮播图**　永久删除该轮播图并解除背景图片引用。图片只有在商品、分类图标和轮播图都不再引用时才可清理。

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
| 404 | `BANNER_NOT_FOUND` | 找不到该轮播图。 |
| 404 | `IMAGE_NOT_FOUND` | 图片不存在或上传已失效，请重新上传。 |
| 409 | `CATEGORY_NAME_EXISTS` | 已有同名分类。 |
| 409 | `CATEGORY_IN_USE` | 该分类下还有商品，请先将商品移到其他分类。 |
| 409 | `CATEGORY_HAS_BANNERS` | 轮播图仍指向该分类，请先更换轮播图的分类或删除对应轮播图。 |
| 409 | `BANNER_LIMIT_REACHED` | 最多可设置 5 张轮播图，请先删除一张。 |
| 429 | `TOO_MANY_REQUESTS` | 尝试次数过多，请稍后再试。 |
| 500 | `INTERNAL_ERROR` | 服务暂时不可用，请稍后再试。 |
