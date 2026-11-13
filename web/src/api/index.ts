// 前端所有数据请求都从这里走。
// 开发阶段默认用假数据；设置 VITE_USE_MOCK=false 后改为请求真实后端。
import type * as Http from "./http.ts";

export { ApiError, UNAUTHENTICATED_EVENT } from "./types.ts";
export type * from "./types.ts";

/** 当前是否在用假数据。仅用于在界面上给出演示提示。 */
export const usingMock = import.meta.env.VITE_USE_MOCK !== "false";

// 两个实现导出同名函数。按环境变量只加载其中一个，另一个不会进入正式构建。
const impl: Promise<typeof Http> = usingMock ? import("./mock.ts") : import("./http.ts");

type Api = typeof Http;

/** 调用时转发给当前实现的同名函数，类型以 http.ts 为准。 */
export const api: Api = new Proxy({} as Api, {
  get(_target, name) {
    return async (...args: unknown[]) => {
      const fn = (await impl)[name as keyof Api] as (...a: unknown[]) => unknown;
      return fn(...args);
    };
  },
});
