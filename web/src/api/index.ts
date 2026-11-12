// 前端所有数据请求都从这里走。
// 开发阶段默认用假数据；设置 VITE_USE_MOCK=false 后改为请求真实后端。
import type * as Http from "./http.ts";

export { ApiError } from "./types.ts";
export type { Category, ListResult, ProductDetail, ProductListItem, ProductQuery, Shop } from "./types.ts";

const useMock = import.meta.env.VITE_USE_MOCK !== "false";

// 两个实现导出同名函数。按环境变量只加载其中一个，另一个不会进入正式构建。
const impl: Promise<typeof Http> = useMock ? import("./mock.ts") : import("./http.ts");

export const api: typeof Http = {
  getShop: async () => (await impl).getShop(),
  listCategories: async () => (await impl).listCategories(),
  listProducts: async (query) => (await impl).listProducts(query),
  getProduct: async (id) => (await impl).getProduct(id),
};
