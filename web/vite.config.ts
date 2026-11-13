import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 三种用法：
//   npm run dev       开发 + 假数据（不需要后端）
//   npm run dev:api   开发 + 连本机真实后端（/api、/uploads 转发到 VITE_BACKEND_ORIGIN）
//   npm run build     正式打包，一律连真实后端，假数据和占位图不会被打包进去
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const useMock = command === "serve" && mode === "development" && env.VITE_USE_MOCK !== "false";
  const backend = env.VITE_BACKEND_ORIGIN || "http://localhost:3000";

  return {
    plugins: [react()],
    define: {
      // 编译时常量：正式打包时为 false，假数据模块会被整个剔除。
      __USE_MOCK__: JSON.stringify(useMock),
    },
    server: {
      host: true, // 允许同一 Wi-Fi 下的手机访问
      port: 5173,
      strictPort: true,
      // 连真实后端时，接口和图片都转发给后端，浏览器看到的是同源请求。
      proxy: useMock
        ? undefined
        : {
            "/api": { target: backend, changeOrigin: false },
            "/uploads": { target: backend, changeOrigin: false },
          },
    },
    build: {
      // 兼容较旧的 iPhone（iOS 13 起）和微信内置浏览器。
      target: ["es2019", "safari13"],
    },
  };
});
