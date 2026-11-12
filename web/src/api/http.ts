import { ApiError } from "./types.ts";
import type { Category, ListResult, ProductDetail, ProductListItem, ProductQuery, Shop } from "./types.ts";

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
  try {
    const body = await response.json();
    if (body && typeof body.code === "string" && typeof body.message === "string") {
      code = body.code;
      message = body.message;
      fieldErrors = body.fieldErrors;
    }
  } catch {
    // 响应体不是约定的错误格式时，使用兜底提示。
  }
  throw new ApiError(response.status, code, message, fieldErrors);
}

function toSearch(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function getShop(): Promise<Shop> {
  return request("/api/shop");
}

export function listCategories(): Promise<ListResult<Category>> {
  return request("/api/categories");
}

export function listProducts(query: ProductQuery = {}): Promise<ListResult<ProductListItem>> {
  return request(`/api/products${toSearch(query)}`);
}

export function getProduct(id: string): Promise<ProductDetail> {
  return request(`/api/products/${encodeURIComponent(id)}`);
}
