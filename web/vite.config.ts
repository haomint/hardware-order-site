import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const backend = env.VITE_BACKEND_ORIGIN || "http://localhost:3000";
  const useMock = env.VITE_USE_MOCK !== "false";

  return {
    plugins: [react()],
    server: {
      host: true, // 允许同一 Wi-Fi 下的手机访问
      port: 5173,
      strictPort: true,
      // 使用真实后端时，接口和图片都转发给后端，浏览器看到的是同源请求。
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
