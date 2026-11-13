// 前端所有数据请求都从这里走。
// `npm run dev` 用假数据；`npm run dev:api` 和正式打包连真实后端（见 vite.config.ts）。
import type * as Http from "./http.ts";

export { ApiError, UNAUTHENTICATED_EVENT } from "./types.ts";
export type * from "./types.ts";

/** 当前是否在用假数据。仅用于在界面上给出演示提示。 */
export const usingMock = __USE_MOCK__;

// __USE_MOCK__ 是编译时常量：正式打包时这里只剩 http.ts，假数据模块不会进入构建产物。
const impl: Promise<typeof Http> = __USE_MOCK__ ? import("./mock.ts") : import("./http.ts");

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
