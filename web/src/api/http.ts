import { ApiError, UNAUTHENTICATED_EVENT } from "./types.ts";
import type {
  AdminImage,
  AdminProduct,
  AdminProductQuery,
  AdminSession,
  CartLookupResult,
  Category,
  CreateOrder,
  OrderReceipt,
  AdminOrderQuery,
  OrderExportLink,
  OrderDetail,
  OrderPage,
  UpdateOrder,
  CategoryInput,
  CategoryPatch,
  CreateProduct,
  ListResult,
  LoginInput,
  ProductDetail,
  ProductListItem,
  ProductQuery,
  Shop,
  UpdateProduct,
} from "./types.ts";

const NETWORK_MESSAGE = "网络不太顺畅，请检查网络后重试。";
const FALLBACK_MESSAGE = "服务暂时不可用，请稍后再试。";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE);
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  let code = "INTERNAL_ERROR";
  let message = FALLBACK_MESSAGE;
  let fieldErrors: Record<string, string> | undefined;
  let unavailableItems: ApiError["unavailableItems"];
  try {
    const body = await response.json();
    if (body && typeof body.code === "string" && typeof body.message === "string") {
      code = body.code;
      message = body.message;
      fieldErrors = body.fieldErrors;
      unavailableItems = Array.isArray(body.unavailableItems) ? body.unavailableItems : undefined;
    }
  } catch {
    // 响应体不是约定的错误格式时，使用兜底提示。
  }
  if (code === "UNAUTHENTICATED") window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  throw new ApiError(response.status, code, message, fieldErrors, unavailableItems);
}

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function toSearch(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

const id = (value: string) => encodeURIComponent(value);

// ── 公开接口 ──────────────────────────────────────────

export function getShop(): Promise<Shop> {
  return request("/api/shop");
}

export function listCategories(): Promise<ListResult<Category>> {
  return request("/api/categories");
}

export function listProducts(query: ProductQuery = {}): Promise<ListResult<ProductListItem>> {
  return request(`/api/products${toSearch(query)}`);
}

export function getProduct(productId: string): Promise<ProductDetail> {
  return request(`/api/products/${id(productId)}`);
}

// ── 购物车与订货（阶段 B） ─────────────────────────────

/** 按商品编号批量查询购物车商品的当前价格和可订状态（最多 100 个）。 */
export function lookupCart(productIds: string[]): Promise<CartLookupResult> {
  return request("/api/cart/items", json("POST", { productIds }));
}

/**
 * 提交订货单。idempotencyKey 由前端为这一次订货生成（UUID v4）；
 * 网络失败重试时沿用同一个键，服务端只会保存一笔订单。
 */
export function createOrder(input: CreateOrder, idempotencyKey: string): Promise<OrderReceipt> {
  return request("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

// ── 管理员会话 ────────────────────────────────────────

export function login(input: LoginInput): Promise<AdminSession> {
  return request("/api/admin/login", json("POST", input));
}

export function getSession(): Promise<AdminSession> {
  return request("/api/admin/session");
}

export function logout(): Promise<void> {
  return request("/api/admin/logout", { method: "POST" });
}

// ── 后台分类 ──────────────────────────────────────────

export function listAdminCategories(): Promise<ListResult<Category>> {
  return request("/api/admin/categories");
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return request("/api/admin/categories", json("POST", input));
}

export function updateCategory(categoryId: string, patch: CategoryPatch): Promise<Category> {
  return request(`/api/admin/categories/${id(categoryId)}`, json("PATCH", patch));
}

export function deleteCategory(categoryId: string): Promise<void> {
  return request(`/api/admin/categories/${id(categoryId)}`, { method: "DELETE" });
}

// ── 后台商品 ──────────────────────────────────────────

export function listAdminProducts(query: AdminProductQuery = {}): Promise<ListResult<AdminProduct>> {
  return request(`/api/admin/products${toSearch(query)}`);
}

export function getAdminProduct(productId: string): Promise<AdminProduct> {
  return request(`/api/admin/products/${id(productId)}`);
}

export function createProduct(input: CreateProduct): Promise<AdminProduct> {
  return request("/api/admin/products", json("POST", input));
}

export function updateProduct(productId: string, patch: UpdateProduct): Promise<AdminProduct> {
  return request(`/api/admin/products/${id(productId)}`, json("PATCH", patch));
}

export function deleteProduct(productId: string): Promise<void> {
  return request(`/api/admin/products/${id(productId)}`, { method: "DELETE" });
}

// ── 后台订单（阶段 B） ─────────────────────────────────

export function listAdminOrders(query: AdminOrderQuery = {}): Promise<OrderPage> {
  return request(`/api/admin/orders${toSearch(query)}`);
}

/**
 * 导出地址。用普通链接打开，由浏览器按服务器给的文件名下载；
 * 这种方式在手机浏览器里兼容性最好（比先下载到内存再保存稳定）。
 */
export async function orderExportLink(from: string, to: string): Promise<OrderExportLink> {
  return { url: `/api/admin/orders/export${toSearch({ from, to })}` };
}

export function getAdminOrder(orderNo: string): Promise<OrderDetail> {
  return request(`/api/admin/orders/${id(orderNo)}`);
}

export function updateAdminOrder(orderNo: string, patch: UpdateOrder): Promise<OrderDetail> {
  return request(`/api/admin/orders/${id(orderNo)}`, json("PATCH", patch));
}

// ── 图片 ──────────────────────────────────────────────

export function uploadImage(file: File): Promise<AdminImage> {
  const form = new FormData();
  form.append("file", file);
  // 不手动设置 Content-Type，让浏览器自动带上 multipart 分隔符。
  return request("/api/admin/images", { method: "POST", body: form });
}
