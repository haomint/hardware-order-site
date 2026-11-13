// 数据结构一律来自 shared/ 契约，这里只做类型转引，不重新定义字段。
// 仅引入类型，构建时会被完全擦除，不会把 zod 打进前端包。
export type {
  Shop,
  Category,
  ProductListItem,
  ProductDetail,
  AdminProduct,
  AdminImage,
  AdminSession,
  CreateProduct,
  UpdateProduct,
  CartLookupResult,
  CreateOrder,
  OrderReceipt,
  OrderPage,
  OrderDetail,
  UpdateOrder,
} from "../../../shared/index.ts";

export type OrderStatus = "pending_contact" | "pending_payment" | "pending_fulfillment" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid";

/** 订单导出的下载链接。filename 仅在浏览器内生成文件时提供。 */
export type OrderExportLink = { url: string; filename?: string };

/** 对应契约的 AdminOrderQuerySchema：URL 查询参数都是字符串。 */
export type AdminOrderQuery = {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
  pageSize?: string;
};

/** ORDER_PRODUCTS_UNAVAILABLE 附带的不可订商品明细。 */
export type UnavailableItem = { productId: string; reason: "unavailable" | "out_of_stock" };

export type ListResult<T> = { items: T[]; total: number };

/** 对应契约的 ProductQuerySchema：URL 查询参数都是字符串。 */
export type ProductQuery = {
  q?: string;
  categoryId?: string;
  page?: string;
  pageSize?: string;
};

/** 对应契约的 AdminProductQuerySchema。 */
export type AdminProductQuery = ProductQuery & {
  isPublished?: "true" | "false";
  isOutOfStock?: "true" | "false";
};

/** 对应契约的 CategoryCreateSchema / CategoryPatchSchema。 */
export type CategoryInput = { name: string; sortOrder?: number };
export type CategoryPatch = { name?: string; sortOrder?: number };

export type LoginInput = { username: string; password: string };

/** 接口约定的错误格式 { code, message }，message 可直接展示给用户。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** 仅 INVALID_REQUEST 可能附带：字段路径 -> 中文提示。 */
  readonly fieldErrors?: Record<string, string>;
  /** 仅 ORDER_PRODUCTS_UNAVAILABLE 附带：哪些商品不可订。 */
  readonly unavailableItems?: UnavailableItem[];

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string>,
    unavailableItems?: UnavailableItem[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.unavailableItems = unavailableItems;
  }
}

/** 后台接口返回「未登录」时在 window 上派发的事件名，后台框架据此跳回登录页。 */
export const UNAUTHENTICATED_EVENT = "admin:unauthenticated";
