import { z } from "zod";
import {
  AdminBannerListSchema,
  AdminBannerSchema,
  AdminImageSchema,
  AdminProductPageSchema,
  AdminProductQuerySchema,
  AdminProductSchema,
  AdminSessionSchema,
  BannerCreateSchema,
  BannerListQuerySchema,
  BannerListSchema,
  BannerPatchSchema,
  CategoryCreateSchema,
  CategoryListQuerySchema,
  CategoryListSchema,
  CategoryPatchSchema,
  CategorySchema,
  CategoryWithIconCreateSchema,
  CategoryWithIconPatchSchema,
  IdParamsSchema,
  ImageUploadSchema,
  LoginSchema,
  ProductCreateSchema,
  ProductDetailSchema,
  ProductPageSchema,
  ProductPatchSchema,
  ProductQuerySchema,
  ShopPatchSchema,
  ShopSchema,
  bannerTextLimits,
  maxBanners,
} from "./stage-a-schemas.ts";

export const AdminSessionCookieName = "admin_session";
export const AdminSessionDays = 30;
export const AdminSessionRenewal = `续发管理员会话 Cookie，新的有效期为 ${AdminSessionDays} 天。`;
export const AdminWriteOriginSchema = z.url("请求来源格式不正确。")
  .regex(/^https?:\/\/[^/?#@\s]+$/, "请求来源必须由协议、主机和可选端口组成。")
  .describe("浏览器自动发送的 Origin，必须精确匹配服务端配置的允许来源，包括协议、主机和端口。");

export const apiErrors = {
  INVALID_REQUEST: { status: 400, message: "请检查填写的内容后重试。" },
  INVALID_ORIGIN: { status: 400, message: "请从店铺后台页面操作。" },
  INVALID_IMAGE: { status: 400, message: "请选择符合要求且可以打开的图片。" },
  UNAUTHENTICATED: { status: 401, message: "请先登录。" },
  INVALID_CREDENTIALS: { status: 401, message: "账号或密码不正确。" },
  CATEGORY_NOT_FOUND: { status: 404, message: "找不到该分类。" },
  PRODUCT_NOT_FOUND: { status: 404, message: "找不到该商品。" },
  BANNER_NOT_FOUND: { status: 404, message: "找不到该轮播图。" },
  IMAGE_NOT_FOUND: { status: 404, message: "图片不存在或上传已失效，请重新上传。" },
  CATEGORY_NAME_EXISTS: { status: 409, message: "已有同名分类。" },
  CATEGORY_IN_USE: { status: 409, message: "该分类下还有商品，请先将商品移到其他分类。" },
  CATEGORY_HAS_BANNERS: { status: 409, message: "轮播图仍指向该分类，请先更换轮播图的分类或删除对应轮播图。" },
  BANNER_LIMIT_REACHED: { status: 409, message: `最多可设置 ${maxBanners} 张轮播图，请先删除一张。` },
  TOO_MANY_REQUESTS: { status: 429, message: "尝试次数过多，请稍后再试。" },
  INTERNAL_ERROR: { status: 500, message: "服务暂时不可用，请稍后再试。" },
} as const;

type ErrorCode = keyof typeof apiErrors;
const otherErrorCodes = (Object.keys(apiErrors) as ErrorCode[]).filter((code) => code !== "INVALID_REQUEST");
const errorMessage = z.string("错误提示必须是文字。").min(1, "请提供错误提示。")
  .describe("可直接显示的简体中文提示。客户端按 code 分支处理。");
const fieldErrorsDescription = "INVALID_REQUEST 可以附带 fieldErrors。键为字段路径，如 name 或 detailImageIds.0，数组下标从 0 开始。值为简体中文提示。无法定位字段时使用 message。";
const errorResponseMessage = "错误响应格式不正确。";

export const InvalidRequestErrorSchema = z.strictObject({
  code: z.literal("INVALID_REQUEST", "错误标识不正确。"),
  message: errorMessage,
  fieldErrors: z.record(
    z.string("字段路径必须是文字。").min(1, "请提供字段路径。"),
    errorMessage,
    "字段错误必须是字段路径到中文提示的映射。",
  ).optional().describe(fieldErrorsDescription),
}, errorResponseMessage);

export const ApiErrorSchema = z.discriminatedUnion("code", [
  InvalidRequestErrorSchema,
  z.strictObject({
    code: z.enum(otherErrorCodes, "错误标识不正确。"),
    message: errorMessage,
  }, errorResponseMessage),
], "错误响应格式或错误标识不正确。");

export const stageAInfo = {
  title: "五金订货网站 · 阶段 A 接口契约",
  version: "0.1.0",
  description: [
    "覆盖公开及后台店铺资料、商品目录、分类与图标、首页轮播图、后台商品管理、管理员会话和图片上传。",
    "商品列表使用 page、pageSize 和 { items, total }。页码超过范围时 items 为空。分类列表一次返回全部匹配分类，格式仍为 { items, total }，其中 total 等于 items.length。",
    "列表查询参数只接受文档列出的单值字段。请求体的未知字段视为参数错误。PATCH 省略的字段保持原值。",
    "商品参考单价用整数分。priceCents 为 null 时显示「价格面议」。品牌和型号未填写时返回空字符串，前台隐藏相应项。新增时可以省略，编辑时传空字符串可清空。已上架商品可以同时缺货。",
    "生产环境同源访问，后台使用 HttpOnly、Secure、SameSite=Lax、Path=/ 的 Cookie。后台写操作校验 Origin。开发环境可通过环境配置加入前端开发服务器的完整来源。跨端口直连时仅对配置的来源开放带凭据的 CORS，前端请求使用 credentials: include。仅本地 HTTP 开发可省略 Cookie 的 Secure 属性。",
    `登录成功后会话有效期为 ${AdminSessionDays} 天。每次需登录的后台接口成功返回时，从本次请求起重新计算 ${AdminSessionDays} 天有效期，同时续发 Cookie。会话到期或主动退出后需重新登录。会话和后台数据禁止缓存。`,
    "公开商品目录应重新验证或禁用缓存，使上下架、缺货和删除变更及时生效。图片以同源根路径公开静态访问，使用不可猜测的随机文件名，可长期缓存。替换图片时使用新路径，源站清理图片后客户端可能仍持有旧缓存。",
    fieldErrorsDescription,
  ].join("\n\n"),
};

type Route = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  tag: string;
  summary: string;
  description?: string;
  admin?: true;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: { schema: z.ZodType; mediaType?: "multipart/form-data" };
  success: { status: 200 | 201 | 204; schema?: z.ZodType; setCookie?: string };
  errors?: readonly ErrorCode[];
};

const categoryTag = "后台分类";
const productTag = "后台商品";
const sessionTag = "管理员会话";
const catalogTag = "公开目录";
const shopTag = "后台店铺资料";
const categoryOrder = "按 sortOrder 升序，再按 createdAt 升序排列。排序值和创建时间均相同时按 id 升序稳定排列。";
const productOrder = "置顶优先，其后按 sortOrder 升序、createdAt 降序排列。前三项均相同时按 id 升序，保证分页稳定。";
const uploadFormat = "用 FormData 的 file 字段上传。服务端检查实际格式、文件大小和解码像素数（最多 2400 万），仅接受静态 JPEG、PNG 或 WebP。手机 HEIC 由前端转为 JPEG 并压缩后上传。重新编码生成压缩图（长边最多 1600 像素）和缩略图（长边最多 480 像素），不保存原图。";
const uploadCleanup = "上传后 24 小时未关联的图片可被清理。Nginx 的请求体限制需容纳 10 MiB 文件和 multipart 封装开销，例如在上传路径设 client_max_body_size 11m。";

export const stageA = {
  getShop: {
    method: "get", path: "/api/shop", tag: catalogTag,
    summary: "查看店铺资料",
    description: "返回当前保存的店名 name、联系电话 phone 和客服微信引导文案 wechatContactText，响应结构沿用 ShopSchema。后台保存成功后，下一次请求即读取新资料。响应使用 Cache-Control: no-store。",
    success: { status: 200, schema: ShopSchema },
  },
  getAdminShop: {
    method: "get", path: "/api/admin/shop", tag: shopTag, admin: true,
    summary: "读取当前店铺资料",
    description: "与公开接口读取同一份已保存的资料。首次启动且数据库还未保存资料时，用 SHOP_NAME、SHOP_PHONE 和 SHOP_WECHAT_CONTACT_TEXT 初始化并持久化。缺省值依次为「威马五金」、空字符串、空字符串。资料一旦保存，重启或修改环境变量不会覆盖它。成功响应续期，且禁止缓存。",
    success: { status: 200, schema: ShopSchema },
  },
  updateAdminShop: {
    method: "patch", path: "/api/admin/shop", tag: shopTag, admin: true,
    summary: "修改店铺资料",
    description: [
      "用 application/json 提交至少一个字段。三项都只接受字符串并去除首尾空白。店名必有内容，最多 100 个字符。",
      "联系电话最多 50 个字符，允许区号，只能填数字、普通空格、加号、减号和英文圆括号。此字符限制用于后台提交。",
      "客服微信引导文案为最多 300 个字符的纯文本，允许换行。保留正文内部的换行，商城按原样分行显示。",
      "传空字符串可清空联系电话或引导文案，省略字段保持原值。未知字段、空请求对象及 null 均返回 INVALID_REQUEST，字段校验错误附中文 fieldErrors。",
      "所有字段校验后一次保存，成功返回完整资料。保存失败返回 INTERNAL_ERROR。",
    ].join(" "),
    body: { schema: ShopPatchSchema },
    success: { status: 200, schema: ShopSchema },
  },
  listCategories: {
    method: "get", path: "/api/categories", tag: catalogTag,
    summary: "查看分类",
    description: `一次返回所有至少关联一件上架商品的分类。已上架的缺货商品计入。${categoryOrder}`,
    query: CategoryListQuerySchema,
    success: { status: 200, schema: CategoryListSchema },
  },
  listProducts: {
    method: "get", path: "/api/products", tag: catalogTag,
    summary: "浏览和搜索商品",
    description: `只返回上架商品，包含缺货商品。分类和关键字可同时使用。列表使用 mainImage.thumbnailUrl。${productOrder}`,
    query: ProductQuerySchema,
    success: { status: 200, schema: ProductPageSchema },
  },
  getProduct: {
    method: "get", path: "/api/products/{id}", tag: catalogTag,
    summary: "查看商品详情",
    description: "下架与不存在均返回 PRODUCT_NOT_FOUND。缺货商品仍返回详情。",
    params: IdParamsSchema,
    success: { status: 200, schema: ProductDetailSchema },
    errors: ["PRODUCT_NOT_FOUND"],
  },
  login: {
    method: "post", path: "/api/admin/login", tag: sessionTag,
    summary: "登录后台",
    description: "验证账号和密码后签发新会话，响应体只返回账号。错误凭证使用同一提示。达到登录频率限制时返回 429。",
    body: { schema: LoginSchema },
    success: { status: 200, schema: AdminSessionSchema, setCookie: "签发新的管理员会话 Cookie。" },
    errors: ["INVALID_CREDENTIALS", "TOO_MANY_REQUESTS"],
  },
  getSession: {
    method: "get", path: "/api/admin/session", tag: sessionTag, admin: true,
    summary: "检查管理员登录状态",
    description: "打开或刷新后台时检查会话，并在成功时续期。会话不存在或失效时返回 401。",
    success: { status: 200, schema: AdminSessionSchema },
  },
  logout: {
    method: "post", path: "/api/admin/logout", tag: sessionTag,
    summary: "退出后台",
    description: "注销现有会话并清除 Cookie。会话已过期或未登录时也返回 204。",
    success: { status: 204, setCookie: "清除管理员会话 Cookie。" },
  },
  listAdminCategories: {
    method: "get", path: "/api/admin/categories", tag: categoryTag, admin: true,
    summary: "查看后台分类列表",
    description: `一次返回所有分类，包含没有上架商品的分类。${categoryOrder}`,
    query: CategoryListQuerySchema,
    success: { status: 200, schema: CategoryListSchema },
  },
  createCategory: {
    method: "post", path: "/api/admin/categories", tag: categoryTag, admin: true,
    summary: "新增分类",
    description: "分类名去除首尾空白后精确判重。",
    body: { schema: CategoryCreateSchema },
    success: { status: 201, schema: CategorySchema },
    errors: ["CATEGORY_NAME_EXISTS"],
  },
  updateCategory: {
    method: "patch", path: "/api/admin/categories/{id}", tag: categoryTag, admin: true,
    summary: "改名或调整分类排序",
    params: IdParamsSchema,
    body: { schema: CategoryPatchSchema },
    success: { status: 200, schema: CategorySchema },
    errors: ["CATEGORY_NOT_FOUND", "CATEGORY_NAME_EXISTS"],
  },
  deleteCategory: {
    method: "delete", path: "/api/admin/categories/{id}", tag: categoryTag, admin: true,
    summary: "删除空分类",
    description: "有商品关联时返回 CATEGORY_IN_USE，关联的下架商品也计入。",
    params: IdParamsSchema,
    success: { status: 204 },
    errors: ["CATEGORY_NOT_FOUND", "CATEGORY_IN_USE"],
  },
  listAdminProducts: {
    method: "get", path: "/api/admin/products", tag: productTag, admin: true,
    summary: "查看和搜索后台商品",
    description: `默认包含上架、下架和缺货商品。筛选项同时提供时须全部匹配。${productOrder}`,
    query: AdminProductQuerySchema,
    success: { status: 200, schema: AdminProductPageSchema },
  },
  getAdminProduct: {
    method: "get", path: "/api/admin/products/{id}", tag: productTag, admin: true,
    summary: "查看后台商品详情",
    params: IdParamsSchema,
    success: { status: 200, schema: AdminProductSchema },
    errors: ["PRODUCT_NOT_FOUND"],
  },
  createProduct: {
    method: "post", path: "/api/admin/products", tag: productTag, admin: true,
    summary: "新增商品",
    description: "默认下架、未缺货、未置顶。发布时必须有主图。图片字段使用上传接口返回的 ID。",
    body: { schema: ProductCreateSchema },
    success: { status: 201, schema: AdminProductSchema },
    errors: ["CATEGORY_NOT_FOUND", "IMAGE_NOT_FOUND"],
  },
  updateProduct: {
    method: "patch", path: "/api/admin/products/{id}", tag: productTag, admin: true,
    summary: "编辑商品、变更上架及缺货状态、维护图片",
    description: "合并修改后校验完整商品。上架必须有主图，主图和详情图不得重复。将图片 ID 从 detailImageIds 移除即可解除详情图关联。主图可以替换，或在商品下架时通过 mainImageId=null 清空。移除的图片在没有商品引用时由服务端清理。",
    params: IdParamsSchema,
    body: { schema: ProductPatchSchema },
    success: { status: 200, schema: AdminProductSchema },
    errors: ["PRODUCT_NOT_FOUND", "CATEGORY_NOT_FOUND", "IMAGE_NOT_FOUND"],
  },
  deleteProduct: {
    method: "delete", path: "/api/admin/products/{id}", tag: productTag, admin: true,
    summary: "删除商品",
    description: "上架和下架商品均可永久删除。前端二次确认后发出请求。成功后商品从前后台目录移除，关联图片仅在无其他引用时清理。阶段 B 的订单必须在下单时保存商品快照，历史订单的展示和处理不依赖商品记录仍然存在。",
    params: IdParamsSchema,
    success: { status: 204 },
    errors: ["PRODUCT_NOT_FOUND"],
  },
  uploadImage: {
    method: "post", path: "/api/admin/images", tag: "图片", admin: true,
    summary: "上传单张商品图片",
    description: `${uploadFormat} 用返回的 id 保存商品。${uploadCleanup}`,
    body: { schema: ImageUploadSchema, mediaType: "multipart/form-data" },
    success: { status: 201, schema: AdminImageSchema },
    errors: ["INVALID_IMAGE"],
  },
} as const satisfies Record<string, Route>;

const bannerTag = "后台轮播图";
const bannerOrder = "按 sortOrder 升序、createdAt 升序、id 升序排列。";
const iconRule = "iconImageId 使用上传接口返回的 ID。服务端校验关联图片可用且宽高相等。图片不存在或上传已失效时返回 IMAGE_NOT_FOUND。图片可用但不是方形时返回 INVALID_REQUEST，fieldErrors.iconImageId 为中文提示。";
const imageReferences = "图片只有在商品、分类图标和轮播图都不再引用时才可清理。";

// 后端在 #68 接入新增契约前，原分类写接口继续使用 stageA 的旧请求模型。
export const storefrontMedia = {
  listCategories: {
    ...stageA.listCategories,
    description: `${stageA.listCategories.description} iconUrl 返回方形缩略图。未设置或图片不可用时返回 null，商城使用内置图标。`,
  },
  listAdminCategories: {
    ...stageA.listAdminCategories,
    description: `${stageA.listAdminCategories.description} iconUrl 可用来预览已保存的图标，未设置或图片不可用时为 null。`,
  },
  createCategory: {
    ...stageA.createCategory,
    description: `${stageA.createCategory.description} 可省略 iconImageId 或传 null，表示不设置图标。${iconRule}`,
    body: { schema: CategoryWithIconCreateSchema },
    errors: [...stageA.createCategory.errors, "IMAGE_NOT_FOUND"],
  },
  updateCategory: {
    ...stageA.updateCategory,
    summary: "修改分类名称、排序或图标",
    description: `PATCH 省略 iconImageId 时保留旧图标，传 null 清除，传新 ID 替换。${iconRule}${imageReferences}`,
    body: { schema: CategoryWithIconPatchSchema },
    errors: [...stageA.updateCategory.errors, "IMAGE_NOT_FOUND"],
  },
  deleteCategory: {
    ...stageA.deleteCategory,
    description: `${stageA.deleteCategory.description} 有轮播图关联时返回 CATEGORY_HAS_BANNERS，隐藏中的轮播图也计入。两种引用同时存在时优先返回 CATEGORY_IN_USE。删除成功后解除图标引用。${imageReferences}`,
    errors: [...stageA.deleteCategory.errors, "CATEGORY_HAS_BANNERS"],
  },
  updateProduct: {
    ...stageA.updateProduct,
    description: `合并修改后校验完整商品。上架必须有主图，主图和详情图不得重复。将图片 ID 从 detailImageIds 移除即可解除详情图关联。主图可以替换，或在商品下架时通过 mainImageId=null 清空。${imageReferences}`,
  },
  uploadImage: {
    ...stageA.uploadImage,
    summary: "上传单张图片",
    description: [
      uploadFormat,
      `可用返回的 id 关联商品、分类图标或轮播背景。${uploadCleanup}`,
      "分类图标建议裁成 480 × 480 像素方图后上传。轮播背景建议 1600 × 800 像素，比例约 2:1，重要内容留在中间。服务端保留原比例，商城和后台预览按容器居中裁剪铺满，标题和按钮由页面叠放在图片上。",
    ].join(" "),
  },
  listBanners: {
    method: "get", path: "/api/banners", tag: catalogTag,
    summary: "查看首页轮播图",
    description: `不分页。只返回 isVisible 为 true、背景图可用、目标分类存在且至少有一件上架商品的轮播图。已上架的缺货商品也计入。点击按 categoryId 进入商品列表。${bannerOrder} 无可展示图片时返回空列表，首页继续使用内置示例图。响应禁止缓存。`,
    query: BannerListQuerySchema,
    success: { status: 200, schema: BannerListSchema },
  },
  listAdminBanners: {
    method: "get", path: "/api/admin/banners", tag: bannerTag, admin: true,
    summary: "查看后台轮播图",
    description: `不分页，显示和隐藏的轮播图均返回。${bannerOrder} isVisible 表示已保存的显示开关。目标分类无上架商品时仍保留设置。若背景文件已不可用，backgroundImageUrl 为 null，可换图或删除该记录。`,
    query: BannerListQuerySchema,
    success: { status: 200, schema: AdminBannerListSchema },
  },
  createBanner: {
    method: "post", path: "/api/admin/banners", tag: bannerTag, admin: true,
    summary: "新增轮播图",
    description: [
      "必须提供可用背景图的 backgroundImageId 和已存在的 categoryId。",
      `title 最多 ${bannerTextLimits.title} 字符，description 最多 ${bannerTextLimits.description} 字符，均可留空。`,
      `buttonText 为 1 至 ${bannerTextLimits.buttonText} 字符，默认为「去看看」。三项均为单行纯文本并去除首尾空白。`,
      `默认隐藏，sortOrder 默认为 0。最多保存 ${maxBanners} 张，隐藏图也计入。`,
    ].join(" "),
    body: { schema: BannerCreateSchema },
    success: { status: 201, schema: AdminBannerSchema },
    errors: ["CATEGORY_NOT_FOUND", "IMAGE_NOT_FOUND", "BANNER_LIMIT_REACHED"],
  },
  updateBanner: {
    method: "patch", path: "/api/admin/banners/{id}", tag: bannerTag, admin: true,
    summary: "修改轮播图及显示顺序",
    description: `至少提交一个字段，省略项保留。可只传 sortOrder 调整顺序，范围为 0 至 9999。${bannerOrder} 更换目标分类时须存在，更换图片或设置 isVisible=true 时须有可用背景图。已损坏的图片可换图或关闭显示。${imageReferences}`,
    params: IdParamsSchema,
    body: { schema: BannerPatchSchema },
    success: { status: 200, schema: AdminBannerSchema },
    errors: ["BANNER_NOT_FOUND", "CATEGORY_NOT_FOUND", "IMAGE_NOT_FOUND"],
  },
  deleteBanner: {
    method: "delete", path: "/api/admin/banners/{id}", tag: bannerTag, admin: true,
    summary: "删除轮播图",
    description: `永久删除该轮播图并解除背景图片引用。${imageReferences}`,
    params: IdParamsSchema,
    success: { status: 204 },
    errors: ["BANNER_NOT_FOUND"],
  },
} as const satisfies Record<string, Route>;
