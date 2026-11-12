import { z } from "zod";

const objectError = "请提交对象格式的数据，且只填写接口允许的字段。";

function text(label: string, max: number) {
  return z.string(`请以文字填写${label}。`).trim().max(max, `${label}不能超过 ${max} 个字符。`);
}

function requiredText(label: string, max: number) {
  return text(label, max).min(1, `请填写${label}。`);
}

export const IdSchema = z.uuidv4("编号格式不正确。").describe("服务端分配的 UUID，客户端按字符串使用。");
export const IdParamsSchema = z.strictObject({ id: IdSchema }, objectError);
const createdAt = z.iso.datetime("创建时间必须为 UTC 时间。")
  .describe("服务端记录的创建时间，ISO 8601 UTC 格式。");

// URL 参数在 HTTP 中是字符串。排序值和金额在 JSON 中是整数。
export const PageQuerySchema = z.strictObject({
  page: z.string("页码必须是正整数。").regex(/^[1-9][0-9]{0,8}$/, "页码必须是 1 至 999999999 的整数。")
    .default("1").describe("页码，从 1 开始。"),
  pageSize: z.string("每页条数必须是正整数。").regex(/^(?:[1-9][0-9]?|100)$/, "每页条数必须是 1 至 100 的整数。")
    .default("20").describe("每页条数，1 至 100。"),
}, objectError);

function listOf<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item, "列表内容必须是数组。"),
    total: z.int("总条数必须是整数。").nonnegative("总条数不能小于零。").describe("匹配条件的总条数。"),
  }, objectError);
}

export const ShopSchema = z.strictObject({
  name: requiredText("店名", 100).describe("店名。"),
  phone: text("联系电话", 50).describe("店铺公开联系电话，可包含区号。未配置时为空字符串。"),
  wechatContactText: text("客服微信引导文案", 300).describe("客服微信引导文案。未配置时为空字符串。"),
}, objectError);

const categoryName = requiredText("分类名称", 50).describe("分类名称，去除首尾空白。");
const sortOrder = z.int("排序值必须是整数。").min(0, "排序值不能小于 0。")
  .max(9999, "排序值不能超过 9999。").describe("显示顺序，数字越小越靠前。");

export const CategoryCreateSchema = z.strictObject({
  name: categoryName,
  sortOrder: sortOrder.default(0),
}, objectError);

export const CategoryPatchSchema = z.strictObject({
  name: categoryName,
  sortOrder,
}, objectError).partial().refine(
  (value) => Object.keys(value).length > 0,
  "请至少填写一项修改内容。",
).meta({ minProperties: 1 });

export const CategorySchema = z.strictObject({ id: IdSchema, name: categoryName, sortOrder, createdAt }, objectError);
export const CategoryListQuerySchema = z.strictObject({}, "分类列表一次返回全部，无需查询参数。");
export const CategoryListSchema = listOf(CategorySchema).refine(
  ({ items, total }) => total === items.length,
  { path: ["total"], error: "分类总条数必须等于返回的分类数量。" },
);

export const ProductQuerySchema = PageQuerySchema.extend({
  q: text("搜索词", 100).optional().describe("匹配名称、品牌或型号中包含的文字。空白等同于未搜索，英文字母忽略大小写。"),
  categoryId: IdSchema.optional().describe("按分类筛选。分类不存在时返回空列表。"),
});

export const AdminProductQuerySchema = ProductQuerySchema.extend({
  isPublished: z.enum(["true", "false"], "上架筛选值必须是 true 或 false。")
    .optional().describe("按上架或下架筛选。省略时查询全部。"),
  isOutOfStock: z.enum(["true", "false"], "缺货筛选值必须是 true 或 false。")
    .optional().describe("按缺货状态筛选。"),
});

const imagePath = z.string("图片路径必须是文字。")
  .regex(/^\/uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/, "图片路径格式不正确。");

export const ImagePathsSchema = z.strictObject({
  imageUrl: imagePath.describe("同源压缩图路径，长边不超过 1600 像素。"),
  thumbnailUrl: imagePath.describe("同源列表缩略图路径，长边不超过 480 像素。"),
}, objectError);

export const AdminImageSchema = ImagePathsSchema.extend({ id: IdSchema });

const productFields = {
  name: requiredText("商品名", 100).describe("商品名，去除首尾空白。"),
  brand: text("品牌", 60).describe("品牌，去除首尾空白。未填写时为空字符串。"),
  model: text("型号", 100).describe("型号，去除首尾空白。未填写时为空字符串。"),
  categoryId: IdSchema,
  priceCents: z.int("请填写整数分，价格面议时填写 null。").nonnegative("参考单价不能小于零。")
    .nullable().describe("参考单价，单位为分。null 表示价格面议，0 表示零元。"),
  unit: requiredText("计量单位", 20).describe("计量单位，例如件、盒或米。"),
  isOutOfStock: z.boolean("请选择是否缺货。").describe("缺货商品仍可在上架时展示，前台应禁用加入购物车。"),
};

const specifications = requiredText("性能和参数说明", 3000).describe("性能和参数说明，纯文本，可换行。");
const isPublished = z.boolean("请选择是否上架。").describe("是否上架。下架商品在公开列表和详情中均不可见。");
const isPinned = z.boolean("请选择是否置顶。").describe("是否置顶。置顶商品排在普通商品之前。");
const mainImageId = IdSchema.nullable().describe("主图 ID。null 表示清空主图，仅允许商品处于下架状态。");
const maxDetailImages = 5;
const detailImageLimitError = `最多可以添加 ${maxDetailImages} 张详情图。`;
const detailImageIds = z.array(IdSchema, "请提交详情图编号列表。").max(maxDetailImages, detailImageLimitError)
  .refine((ids) => new Set(ids).size === ids.length, "详情图不能重复。")
  .meta({
    uniqueItems: true,
    description: "详情图 ID，按数组顺序显示。保存时替换整组，空数组表示移除全部详情图。",
  });

export const ProductListItemSchema = z.strictObject({
  id: IdSchema,
  ...productFields,
  createdAt,
  mainImage: ImagePathsSchema,
}, objectError);

export const ProductDetailSchema = ProductListItemSchema.extend({
  specifications,
  detailImages: z.array(ImagePathsSchema, "详情图必须是数组。").max(maxDetailImages, detailImageLimitError),
});

export const AdminProductSchema = ProductDetailSchema.extend({
  mainImage: AdminImageSchema.nullable(),
  detailImages: z.array(AdminImageSchema, "详情图必须是数组。").max(maxDetailImages, detailImageLimitError),
  isPublished,
  isPinned,
  sortOrder,
});

export const ProductPageSchema = listOf(ProductListItemSchema);
export const AdminProductPageSchema = listOf(AdminProductSchema);

const productWrite = z.strictObject({
  ...productFields,
  specifications,
  isPublished,
  isPinned,
  sortOrder,
  mainImageId,
  detailImageIds,
}, objectError);

// 后端对 PATCH 合并后的商品也使用此规则，防止上架时缺少主图或引用重复图片。
export const ProductWriteSchema = productWrite
  .refine((value) => !value.isPublished || value.mainImageId !== null, {
    path: ["mainImageId"],
    message: "请先上传主图再上架。",
  })
  .refine((value) => value.mainImageId === null || !value.detailImageIds.includes(value.mainImageId), {
    path: ["detailImageIds"],
    message: "主图不能同时作为详情图。",
  });

export const ProductCreateSchema = z.strictObject({
  ...productWrite.shape,
  brand: productFields.brand.default(""),
  model: productFields.model.default(""),
  isPublished: isPublished.default(false),
  isOutOfStock: productFields.isOutOfStock.default(false),
  isPinned: isPinned.default(false),
  sortOrder: sortOrder.default(0),
  mainImageId: mainImageId.default(null),
  detailImageIds: detailImageIds.default([]),
}, objectError).pipe(ProductWriteSchema).describe("上架时必须指定主图，主图和详情图不得重复。");

export const ProductPatchSchema = productWrite.partial().refine(
  (value) => Object.keys(value).length > 0,
  "请至少填写一项修改内容。",
).meta({ minProperties: 1 });

export const LoginSchema = z.strictObject({
  username: requiredText("管理员账号", 64).describe("管理员账号，去除首尾空白。"),
  password: z.string("请填写管理员密码。").min(1, "请填写管理员密码。")
    .max(256, "管理员密码不能超过 256 个字符。").describe("管理员密码，保留原样。"),
}, objectError);

export const AdminSessionSchema = LoginSchema.pick({ username: true });

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const imageMaxBytes = 10 * 1024 * 1024;

export const ImageUploadSchema = z.strictObject({
  file: z.file("请选择一张图片。").min(1, "所选图片为空，请重新选择。")
    .max(imageMaxBytes, "单张图片不能超过 10 MiB。").mime(imageMimeTypes, "请选择 JPEG、PNG 或 WebP 图片。")
    .describe(`单个图片文件，接受 ${imageMimeTypes.join("、")}，最大 ${imageMaxBytes / 1024 / 1024} MiB。`),
}, objectError);

export type Shop = z.output<typeof ShopSchema>;
export type Category = z.output<typeof CategorySchema>;
export type ProductListItem = z.output<typeof ProductListItemSchema>;
export type ProductDetail = z.output<typeof ProductDetailSchema>;
export type AdminProduct = z.output<typeof AdminProductSchema>;
export type AdminImage = z.output<typeof AdminImageSchema>;
export type AdminSession = z.output<typeof AdminSessionSchema>;
export type CreateProduct = z.input<typeof ProductCreateSchema>;
export type UpdateProduct = z.input<typeof ProductPatchSchema>;
