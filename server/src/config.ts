import { resolve } from "node:path";
import { AdminWriteOriginSchema, ShopSchema } from "../../shared/index.ts";
import { loadWecomConfig } from "./wecom.ts";

export function databasePath(env = process.env) {
  return resolve(env.DATABASE_PATH || "data/hardware-order.sqlite");
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const siteOrigin = AdminWriteOriginSchema.parse(env.SITE_ORIGIN || (production ? "" : "http://localhost:5173"));
  if (new URL(siteOrigin).origin !== siteOrigin || (production && !siteOrigin.startsWith("https://"))) {
    throw new Error("SITE_ORIGIN 必须是完整站点来源，生产环境须使用 HTTPS。");
  }

  const developmentOrigins = new Set<string>();
  if (!production) {
    for (const value of (env.DEV_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)) {
      const origin = AdminWriteOriginSchema.parse(value);
      if (new URL(origin).origin !== origin) throw new Error("DEV_ALLOWED_ORIGINS 包含无效来源。");
      developmentOrigins.add(origin);
    }
    developmentOrigins.add(siteOrigin);
  }

  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是有效端口。");
  const trustProxy = env.TRUST_PROXY ?? "false";
  if (trustProxy !== "true" && trustProxy !== "false") throw new Error("TRUST_PROXY 必须是 true 或 false。");

  return {
    port,
    host: env.HOST || "127.0.0.1",
    databasePath: databasePath(env),
    uploadDir: resolve(env.UPLOAD_DIR || "uploads"),
    siteOrigin,
    trustProxy: trustProxy === "true",
    developmentOrigins,
    secureCookie: production || siteOrigin.startsWith("https://"),
    wecom: loadWecomConfig(env),
    shop: ShopSchema.parse({
      name: env.SHOP_NAME ?? "威马五金",
      phone: env.SHOP_PHONE ?? "",
      wechatContactText: env.SHOP_WECHAT_CONTACT_TEXT ?? "",
    }),
  };
}

export type Config = ReturnType<typeof loadConfig>;
