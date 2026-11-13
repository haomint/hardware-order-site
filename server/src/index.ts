import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { createApp } from "./http.ts";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const { app, cleanup, notifications } = createApp(db, config);
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

function processNotifications() {
  void notifications.processDue().catch(() => {
    console.error("订单提醒处理失败，将在下次检查时继续。");
  });
}
const notificationPoll = setInterval(processNotifications, 1000).unref();
processNotifications();

async function closeDatabase() {
  try {
    await notifications.drain();
  } catch {
    console.error("订单提醒处理失败，下次启动时继续。");
  } finally {
    db.close();
  }
}

server.on("error", (error) => {
  console.error("HTTP 服务启动失败。", error);
  clearInterval(sweep);
  clearInterval(notificationPoll);
  void closeDatabase();
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(sweep);
    clearInterval(notificationPoll);
    server.close(() => { void closeDatabase(); });
  });
}
