import { z } from "zod";
import { InvalidRequestErrorSchema, apiErrors } from "./stage-a.ts";
import { IdSchema } from "./stage-a-schemas.ts";
import {
  AdminOrderQuerySchema,
  CartLookupResultSchema,
  CartLookupSchema,
  OrderCreateSchema,
  OrderCsvSchema,
  OrderDetailSchema,
  OrderExportQuerySchema,
  OrderIdempotencyHeadersSchema,
  OrderPageSchema,
  OrderParamsSchema,
  OrderPatchSchema,
  OrderReceiptSchema,
  ProductUnavailableReasonSchema,
  orderStatusTransitions,
} from "./stage-b-schemas.ts";

const productUnavailableExample = {
  unavailableItems: [
    { productId: "ff5ea380-df7e-4a6a-9f15-be544244ad37", reason: "out_of_stock" },
    { productId: "21859dfc-04d8-4bc3-941a-8d5d1cb8686b", reason: "unavailable" },
  ],
} as const;

export const stageBErrors = {
  INVALID_REQUEST: apiErrors.INVALID_REQUEST,
  INVALID_ORIGIN: apiErrors.INVALID_ORIGIN,
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  TOO_MANY_REQUESTS: apiErrors.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: apiErrors.INTERNAL_ERROR,
  ORDER_NOT_FOUND: { status: 404, message: "找不到该订单。" },
  ORDER_PRODUCTS_UNAVAILABLE: {
    status: 409,
    message: "部分商品已下架、删除或缺货，请返回购物车调整。",
    example: productUnavailableExample,
  },
  IDEMPOTENCY_KEY_CONFLICT: { status: 409, message: "这次提交与原订货单内容不同，请重新确认。" },
  ORDER_STATUS_CONFLICT: { status: 409, message: "当前订单状态不允许此修改，请刷新后重试。" },
  ORDER_TOTAL_TOO_LARGE: { status: 409, message: "预估商品金额过大，请联系店铺确认。" },
} as const;

const productUnavailableCode = "ORDER_PRODUCTS_UNAVAILABLE";
const orderErrorCodes = (Object.keys(stageBErrors) as (keyof typeof stageBErrors)[])
  .filter((code) => code !== "INVALID_REQUEST" && code !== productUnavailableCode);
const orderError = z.strictObject({
  code: z.enum(orderErrorCodes),
  message: z.string().min(1),
});
const unavailableOrderError = z.strictObject({
  code: z.literal(productUnavailableCode),
  message: z.string().min(1),
  unavailableItems: z.array(z.strictObject({
    productId: IdSchema,
    reason: ProductUnavailableReasonSchema,
  })).min(1).max(100).describe("本次请求中所有不可订商品，按请求顺序返回。"),
});

export const StageBApiErrorSchema = z.discriminatedUnion("code", [
  InvalidRequestErrorSchema,
  orderError,
  unavailableOrderError,
]);

// 校验路由声明只引用该阶段允许的错误。
type ErrorCode = keyof typeof stageBErrors;
type Success = {
  status: 200 | 201;
  schema: z.ZodType;
  description?: string;
  mediaType?: "text/csv";
  headers?: z.ZodType;
};
type Route = {
  method: "get" | "post" | "patch";
  path: string;
  tag: string;
  summary: string;
  description: string;
  admin?: true;
  params?: z.ZodType;
  query?: z.ZodType;
  headers?: z.ZodType;
  body?: { schema: z.ZodType };
  success: Success;
  additionalSuccess?: readonly Success[];
  errors?: readonly ErrorCode[];
};

export const orderCsvColumns = [
  "orderNo", "createdAt", "contactName", "phone", "deliveryMethod", "address", "note",
  "items", "estimatedTotalCents", "finalTotalCents", "status", "paymentStatus",
] as const;

const transitionDescription = Object.entries(orderStatusTransitions)
  .map(([current, next]) => `${current} → ${next.length ? next.join("、") : "无后续状态"}`).join("。");

export const stageBInfo = {
  title: "五金订货网站 · 阶段 B 接口契约草案",
  version: "0.1.0-draft.1",
  description: [
    "公开接口覆盖购物车刷新和提交订货单。订单详情、处理和导出仅对已登录管理员开放。下单成功页通过阶段 A 的 GET /api/shop 获取联系方式。",
    "接口时间为 ISO 8601 UTC，页面按北京时间显示。日期筛选按订单创建时间，from 含、to 不含。选取整日或整月时，前端先按北京时间计算起止，再转为 UTC。",
    "金额一律为整数分。商品单价为 null 表示价格面议。预估商品金额排除面议商品和运费。最终确认金额及收款标记由管理员独立维护。",
    "后台接口沿用阶段 A 的 HttpOnly Cookie、成功请求滑动续期、写操作 Origin 校验。所有阶段 B 响应禁用缓存。",
    "错误响应使用 { code, message }。INVALID_REQUEST 可附带 fieldErrors，以点号连接字段与数组下标，如 items.0.quantity。ORDER_PRODUCTS_UNAVAILABLE 附带 unavailableItems。",
  ].join("\n\n"),
};

export const stageB = {
  lookupCart: {
    method: "post", path: "/api/cart/items", tag: "公开订货",
    summary: "批量刷新购物车商品",
    description: "每个请求的 ID 对应一项，按输入顺序返回。available 和 out_of_stock 均返回当前公开商品信息（含价格和图片），后者不可下单。已下架、已删除和不存在统一返回 unavailable，只返回 ID 与状态。前端有本地商品名称时可显示名称，否则可显示「商品已不可订」。",
    body: { schema: CartLookupSchema },
    success: { status: 200, schema: CartLookupResultSchema },
  },
  createOrder: {
    method: "post", path: "/api/orders", tag: "公开订货",
    summary: "提交订货单",
    description: [
      "免登录，按访问者 IP 限流。服务端在同一写入事务中检查商品当前状态、按当前参考价重算金额、保存商品快照并生成唯一订单号。初始状态为待联系、未收款。",
      "送货必须填写地址，自提保存为 null。已下架、已删除、不存在或缺货的商品全部列在 409 ORDER_PRODUCTS_UNAVAILABLE 中，整单拒绝。金额计算结果无法用安全整数表示时返回 409 ORDER_TOTAL_TOO_LARGE。",
      "首次成功返回 201。同一个 Idempotency-Key 与相同的规范化请求重复提交（包括并发重试），返回 200 和原始回执，只保存一笔订单。成功后的重放优先于库存与价格检查，即使商品后来发生变化也返回原回执。",
      "规范化包括去除文字首尾空白、UUID 小写、忽略自提地址、缺省备注视为空，商品行顺序不参与比较。已成功的键与订单一同保存，用于不同内容时返回 409 IDEMPOTENCY_KEY_CONFLICT。提交失败不占用键。客户端只在提交内容有意变更或开始一笔新订单时生成新键。",
      "回执包含订单号、联系人、下单时间、商品快照和预估金额。服务端不提供免登录的订单查询接口。订单号日序号按北京时间的自然日递增，达到 9999 后当天的新单返回 500。",
    ].join(" "),
    headers: OrderIdempotencyHeadersSchema,
    body: { schema: OrderCreateSchema },
    success: { status: 201, schema: OrderReceiptSchema, description: "订货单已创建。" },
    additionalSuccess: [{ status: 200, schema: OrderReceiptSchema, description: "重复提交，返回原始回执。" }],
    errors: ["ORDER_PRODUCTS_UNAVAILABLE", "IDEMPOTENCY_KEY_CONFLICT", "ORDER_TOTAL_TOO_LARGE", "TOO_MANY_REQUESTS"],
  },
  listAdminOrders: {
    method: "get", path: "/api/admin/orders", tag: "后台订单", admin: true,
    summary: "查询后台订单",
    description: "按 createdAt 倒序，同一时刻按 orderNo 倒序。状态、收款标记、时间和关键词同时给出时须全部满足。关键词可匹配订单号或手机号。分页超出范围时返回空 items，total 仍是匹配总数。",
    query: AdminOrderQuerySchema,
    success: { status: 200, schema: OrderPageSchema },
  },
  getAdminOrder: {
    method: "get", path: "/api/admin/orders/{orderNo}", tag: "后台订单", admin: true,
    summary: "查看订单详情",
    description: "商品信息以快照为准，商品修改或删除后仍可查看。初始 updatedAt、状态与收款标记的修改时间等于创建时间。内部备注初始为空字符串，取消原因与最终确认金额初始为 null，这三项的修改时间在首次变更前为 null。",
    params: OrderParamsSchema,
    success: { status: 200, schema: OrderDetailSchema },
    errors: ["ORDER_NOT_FOUND"],
  },
  updateAdminOrder: {
    method: "patch", path: "/api/admin/orders/{orderNo}", tag: "后台订单", admin: true,
    summary: "处理订单与修改收款记录",
    description: [
      `省略的字段保持原值。多项修改一起成功或失败。允许的状态流转为 ${transitionDescription}。重复设置当前状态视为无变化，其他非法流转返回 409 ORDER_STATUS_CONFLICT。`,
      "首次取消须同时提交非空 cancellationReason，前端先二次确认。已取消订单可单独修订原因。未取消订单单独提交原因时返回 409 ORDER_STATUS_CONFLICT。",
      "收款标记可独立改为已收款或未收款，包括订单已完成或已取消时。状态流转不会自动改变收款标记，未收款也可以履约和完成。最终确认金额可填非负整数分或传 null 清除。",
      "服务端只在值实际变化时更新对应字段的修改时间和 updatedAt。无变化时返回当前详情。",
    ].join(" "),
    params: OrderParamsSchema,
    body: { schema: OrderPatchSchema },
    success: { status: 200, schema: OrderDetailSchema },
    errors: ["ORDER_NOT_FOUND", "ORDER_STATUS_CONFLICT"],
  },
  exportAdminOrders: {
    method: "get", path: "/api/admin/orders/export", tag: "后台订单", admin: true,
    summary: "按时间范围导出订单 CSV",
    description: [
      "from 和 to 必填。仅按创建时间范围筛选，返回全部匹配订单，排序与列表一致。无匹配项时返回只有表头的 CSV。",
      `CSV 使用 UTF-8 BOM 和 CRLF，每行一笔订单。表头顺序为 ${orderCsvColumns.join("、")}。`,
      "items 单元格为商品快照数组的 JSON 文本。金额用整数分，未记录的最终确认金额、自提地址输出空单元格。送货方式、状态和收款标记使用契约枚举值。",
      "单元格按 CSV 规则转义。对可能被表格软件当作公式的用户输入文本加单引号前缀，包括忽略前导空白后以 =、+、- 或 @ 开头的内容。手机号按文本输出，避免 Excel 转换显示格式。",
    ].join(" "),
    query: OrderExportQuerySchema,
    success: {
      status: 200,
      mediaType: "text/csv",
      schema: OrderCsvSchema,
      headers: z.strictObject({
        "Content-Disposition": z.string().describe('下载附件，文件名为 orders.csv。'),
      }),
    },
  },
} as const satisfies Record<string, Route>;
