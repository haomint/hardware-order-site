import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { createApp } from "./http.ts";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const { app, cleanup } = createApp(db, config);
cleanup();

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`五金订货 API 已监听 ${info.address}:${info.port}`);
});
const sweep = setInterval(() => {
  try {
    cleanup();
  } catch (error) {
    console.error("后台清理失败，下次重试。", error);
  }
}, 15 * 60 * 1000).unref();

server.on("error", (error) => {
  console.error("HTTP 服务启动失败。", error);
  clearInterval(sweep);
  db.close();
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(sweep);
    server.close(() => db.close());
  });
}
