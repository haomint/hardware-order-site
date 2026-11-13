import { z } from "zod";
import { IdSchema, PageQuerySchema, ProductListItemSchema } from "./stage-a-schemas.ts";

const objectError = "请提交对象格式的数据，且只填写接口允许的字段。";
const maxItems = 100;
const timestamp = z.iso.datetime("请填写 ISO 8601 格式的 UTC 时间。");
const cents = z.int("金额必须是整数分。").nonnegative("金额不能小于零。");
const orderNo = z.string("请填写订单号。")
  .regex(/^WJ-[0-9]{8}-(?!0000)[0-9]{4}$/, "订单号格式不正确。")
  .describe("服务端按北京时间生成的订单号，格式 WJ-YYYYMMDD-NNNN，日序号为 0001 至 9999。");
const contactName = z.string("请填写联系人姓名。").trim()
  .min(2, "联系人姓名至少 2 个字符。").max(30, "联系人姓名不能超过 30 个字符。");
const phone = z.string("请填写手机号。").trim()
  .regex(/^1[3-9][0-9]{9}$/, "请填写有效的 11 位中国大陆手机号。");
const address = z.string("请填写收货地址。").trim().max(200, "收货地址不能超过 200 个字符。");
const note = z.string("备注必须是文字。").trim().max(300, "备注不能超过 300 个字符。");
const adminNote = z.string("内部备注必须是文字。").trim().max(1000, "内部备注不能超过 1000 个字符。");
const cancellationReason = z.string("请填写取消原因。").trim()
  .min(1, "请填写取消原因。").max(300, "取消原因不能超过 300 个字符。");

export const DeliveryMethodSchema = z.enum(["delivery", "pickup"], "请选择送货或到店自提。")
  .describe("delivery 为送货，pickup 为到店自提。");
export const OrderStatusSchema = z.enum(
  ["pending_contact", "pending_payment", "pending_fulfillment", "completed", "cancelled"],
  "请选择有效的订单状态。",
).describe("依次为待联系、待收款、待履约、已完成、已取消。");
export const PaymentStatusSchema = z.enum(["unpaid", "paid"], "请选择未收款或已收款。")
  .describe("unpaid 为未收款，paid 为已收款。由管理员独立维护。");

type OrderStatus = z.output<typeof OrderStatusSchema>;
export const orderStatusTransitions = {
  pending_contact: ["pending_payment", "pending_fulfillment", "cancelled"],
  pending_payment: ["pending_fulfillment", "cancelled"],
  pending_fulfillment: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
} as const satisfies Record<OrderStatus, readonly OrderStatus[]>;

const itemCount = (limit: number) => `最多可提交 ${limit} 种商品。`;

export const CartLookupSchema = z.strictObject({
  productIds: z.array(IdSchema, "请提交商品编号列表。")
    .max(maxItems, itemCount(maxItems))
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, "商品编号不能重复。")
    .meta({ uniqueItems: true })
    .describe("购物车中的商品编号，最多 100 个。空数组返回空结果。"),
}, objectError);

export const ProductUnavailableReasonSchema = z.enum(["unavailable", "out_of_stock"], "商品不可订原因无效。")
  .describe("unavailable 表示已下架、已删除或不存在，out_of_stock 表示已上架但缺货。");

const CartItemSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    productId: IdSchema,
    availability: z.enum(["available", "out_of_stock"]),
    product: ProductListItemSchema,
  }),
  z.strictObject({ productId: IdSchema, availability: z.literal("unavailable") }),
]);

export const CartLookupResultSchema = z.strictObject({
  items: z.array(CartItemSchema).max(maxItems),
});

const quantity = z.int("数量必须是整数。").min(1, "数量至少为 1。").max(9999, "单项数量不能超过 9999。");
const orderItemInput = z.strictObject({ productId: IdSchema, quantity }, objectError);

export const OrderIdempotencyHeadersSchema = z.strictObject({
  "Idempotency-Key": z.uuidv4("防重复提交键必须是有效的 UUID v4。")
    .describe("前端为每次新的订货意图生成 UUID v4。对同一次提交重试时保留原键。"),
}, objectError);

export const OrderCreateSchema = z.strictObject({
  items: z.array(orderItemInput, "请提交订货商品列表。").min(1, "请至少选择一种商品。")
    .max(maxItems, itemCount(maxItems))
    .describe("每种商品只提交一行，商品 ID 忽略字母大小写。"),
  contactName,
  phone,
  deliveryMethod: DeliveryMethodSchema,
  address: address.optional().describe("送货时必填。自提时可省略，服务端忽略自提时填写的地址。"),
  note: note.default(""),
}, objectError).superRefine(({ items, deliveryMethod, address }, ctx) => {
  if (deliveryMethod === "delivery" && !address) {
    ctx.addIssue({ code: "custom", path: ["address"], message: "送货时请填写收货地址。" });
  }
  const seen = new Set<string>();
  for (const [index, { productId }] of items.entries()) {
    const id = productId.toLowerCase();
    if (seen.has(id)) {
      ctx.addIssue({ code: "custom", path: ["items", index, "productId"], message: "同一种商品只能提交一行。" });
    }
    seen.add(id);
  }
}).meta({
  if: { properties: { deliveryMethod: { const: "delivery" } } },
  then: { required: ["address"], properties: { address: { pattern: "\\S" } } },
});

export const OrderItemSnapshotSchema = z.strictObject({
  productId: IdSchema.describe("下单时的商品编号，商品删除后仍保留。"),
  name: ProductListItemSchema.shape.name,
  brand: ProductListItemSchema.shape.brand,
  model: ProductListItemSchema.shape.model,
  unit: ProductListItemSchema.shape.unit,
  unitPriceCents: cents.nullable().describe("下单时的参考单价，null 表示价格面议。"),
  quantity,
  subtotalCents: cents.nullable().describe("参考单价乘以数量。面议项返回 null。"),
});

const orderItems = z.array(OrderItemSnapshotSchema).min(1).max(maxItems);
const estimatedTotalCents = cents.describe("下单时的预估商品金额，不含面议商品及运费。全为面议时为 0。");
export const OrderReceiptSchema = z.strictObject({
  orderNo,
  createdAt: timestamp,
  contactName,
  items: orderItems,
  estimatedTotalCents,
});

export const OrderParamsSchema = z.strictObject({ orderNo }, objectError);

export const OrderSummarySchema = z.strictObject({
  orderNo,
  createdAt: timestamp,
  updatedAt: timestamp,
  contactName,
  phone,
  deliveryMethod: DeliveryMethodSchema,
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema,
  estimatedTotalCents,
  finalTotalCents: cents.nullable().describe("人工确认的最终金额，未记录时为 null。"),
});

export const OrderDetailSchema = OrderSummarySchema.extend({
  items: orderItems,
  address: address.nullable().describe("送货地址。自提时为 null。"),
  note,
  adminNote,
  cancellationReason: cancellationReason.nullable(),
  statusUpdatedAt: timestamp,
  paymentStatusUpdatedAt: timestamp,
  adminNoteUpdatedAt: timestamp.nullable(),
  finalTotalUpdatedAt: timestamp.nullable(),
  cancellationReasonUpdatedAt: timestamp.nullable(),
});

const from = timestamp.describe("按创建时间筛选的起点（含）。");
const to = timestamp.describe("按创建时间筛选的终点（不含）。");
function validRange(range: { from?: string; to?: string }) {
  return !range.from || !range.to || Date.parse(range.from) < Date.parse(range.to);
}
const rangeError = { path: ["to"], error: "结束时间必须晚于开始时间。" };

export const AdminOrderQuerySchema = PageQuerySchema.extend({
  status: OrderStatusSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  from: from.optional(),
  to: to.optional(),
  q: z.string("搜索词必须是文字。").trim().max(32, "搜索词不能超过 32 个字符。").optional()
    .describe("按订单号或手机号做子串匹配。订单号忽略字母大小写，空白等同于未搜索。"),
}).refine(validRange, rangeError);

export const OrderPageSchema = z.strictObject({
  items: z.array(OrderSummarySchema),
  total: z.int().nonnegative().describe("符合筛选条件的总条数。"),
});

export const OrderPatchSchema = z.strictObject({
  status: OrderStatusSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  adminNote: adminNote.optional().describe("空字符串清除内部备注。"),
  cancellationReason: cancellationReason.optional(),
  finalTotalCents: OrderSummarySchema.shape.finalTotalCents.optional().describe("null 清除最终确认金额。"),
}, objectError).superRefine((patch, ctx) => {
  if (!Object.keys(patch).length) ctx.addIssue({ code: "custom", message: "请至少填写一项修改内容。" });
  if (patch.status === "cancelled" && !patch.cancellationReason) {
    ctx.addIssue({ code: "custom", path: ["cancellationReason"], message: "请填写取消原因。" });
  }
  if (patch.status && patch.status !== "cancelled" && patch.cancellationReason !== undefined) {
    ctx.addIssue({ code: "custom", path: ["cancellationReason"], message: "仅已取消的订单可以填写取消原因。" });
  }
}).meta({ minProperties: 1 });

export const OrderExportQuerySchema = z.strictObject({ from, to }, objectError).refine(validRange, rangeError);
export const OrderCsvSchema = z.string().describe("带 BOM 的 UTF-8 CSV，每行一笔订单。");

export type CartLookupInput = z.input<typeof CartLookupSchema>;
export type CartLookupResult = z.output<typeof CartLookupResultSchema>;
export type CreateOrder = z.input<typeof OrderCreateSchema>;
export type OrderReceipt = z.output<typeof OrderReceiptSchema>;
export type AdminOrderQuery = z.input<typeof AdminOrderQuerySchema>;
export type OrderPage = z.output<typeof OrderPageSchema>;
export type OrderDetail = z.output<typeof OrderDetailSchema>;
export type UpdateOrder = z.input<typeof OrderPatchSchema>;
export type OrderExportQuery = z.input<typeof OrderExportQuerySchema>;
