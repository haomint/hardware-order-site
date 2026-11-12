// 数据结构一律来自 shared/ 契约，这里只做类型转引，不重新定义字段。
// 仅引入类型，构建时会被完全擦除，不会把 zod 打进前端包。
export type {
  Shop,
  Category,
  ProductListItem,
  ProductDetail,
} from "../../../shared/index.ts";

export type ListResult<T> = { items: T[]; total: number };

/** 对应契约的 ProductQuerySchema：URL 查询参数都是字符串。 */
export type ProductQuery = {
  q?: string;
  categoryId?: string;
  page?: string;
  pageSize?: string;
};

/** 接口约定的错误格式 { code, message }，message 可直接展示给用户。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
