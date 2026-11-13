import type { IncomingMessage } from "node:http";
import { isIP, SocketAddress } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { AdminSessionCookieName, ApiErrorSchema, apiErrors, stageA } from "../../shared/index.ts";
import { createAuth } from "./auth.ts";
import { createCatalog } from "./catalog.ts";
import type { Config } from "./config.ts";
import { ApiFailure, validate, type Schema } from "./errors.ts";
import { createImages } from "./images.ts";

type NodeConnection = { incoming: IncomingMessage };
type HttpEnv = {
  Bindings: NodeConnection | { server: NodeConnection };
  Variables: { adminUsername: string };
};
type ApiContext = Context<HttpEnv>;

function normalizeIp(value?: string) {
  if (!value) return undefined;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return undefined;
  const address = new SocketAddress({ address: value, family: "ipv6" }).address;
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function visitorIp(c: ApiContext, trustProxy: boolean) {
  if (trustProxy) {
    // 直属反向代理覆盖转发链，或在链的最右侧追加它看到的访问者地址。
    const forwarded = c.req.header("X-Forwarded-For")?.split(",").at(-1)?.trim();
    const ip = normalizeIp(forwarded) ?? normalizeIp(c.req.header("X-Real-IP")?.trim());
    if (ip) return ip;
  }
  return normalizeIp(c.env ? getConnInfo(c).remote.address : undefined) ?? "unknown";
}

type Route = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  admin?: boolean;
  params?: Schema;
  query?: Schema;
  body?: { schema: Schema; mediaType?: "multipart/form-data" };
  success: { status: 200 | 201 | 204; schema?: Schema };
};

type Parse<T> = T extends Schema<infer Result> ? Result : undefined;
type Input<R extends Route> = {
  params: Parse<R["params"]>;
  query: Parse<R["query"]>;
  body: R["body"] extends { schema: infer Body } ? Parse<Body> : undefined;
};

function errorResponse(c: ApiContext, error: ApiFailure) {
  const { code, message, fieldErrors } = error;
  return c.json(ApiErrorSchema.parse(fieldErrors ? { code, message, fieldErrors } : { code, message }),
    apiErrors[code].status);
}

function singleValues(entries: Iterable<[string, unknown]>) {
  const values = new Map<string, unknown>();
  for (const [key, value] of entries) {
    if (values.has(key)) throw new ApiFailure("INVALID_REQUEST", { [key]: "该字段只能提交一次。" });
    values.set(key, value);
  }
  return Object.fromEntries(values);
}

async function readBody(c: ApiContext, multipart: boolean): Promise<unknown> {
  const type = c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (type !== (multipart ? "multipart/form-data" : "application/json")) {
    throw new ApiFailure("INVALID_REQUEST");
  }
  try {
    if (multipart) return singleValues(await c.req.raw.formData());
    return await c.req.json();
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure("INVALID_REQUEST");
  }
}

function uploadQueue(): MiddlewareHandler<HttpEnv> {
  const waiting: (() => void)[] = [];
  let processing = false;
  return async (c, next) => {
    if (processing) {
      // 一件商品最多同时上传一张主图和五张详情图，逐张读取请求体并处理。
      if (waiting.length >= 5) throw new ApiFailure("INTERNAL_ERROR");
      await new Promise<void>((ready) => waiting.push(ready));
    } else {
      processing = true;
    }
    try {
      if (!c.req.raw.signal.aborted) await next();
    } finally {
      const ready = waiting.shift();
      if (ready) ready();
      else processing = false;
    }
  };
}

export function createApp(db: DatabaseSync, config: Config, now = Date.now) {
  const app = new Hono<HttpEnv>();
  const auth = createAuth(db, now);
  const catalog = createCatalog(db, now);
  const images = createImages(db, config.uploadDir, now);
  const queueUpload = uploadQueue();

  function writeCookie(c: ApiContext, token: string, maxAge: number) {
    setCookie(c, AdminSessionCookieName, token, {
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: "Lax",
      path: "/",
      maxAge,
    });
  }

  app.onError((error, c) => {
    if (error instanceof ApiFailure) return errorResponse(c, error);
    console.error("接口处理失败。", c.req.method, c.req.path, error);
    return errorResponse(c, new ApiFailure("INTERNAL_ERROR"));
  });
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  if (config.developmentOrigins.size) {
    app.use("/api/*", cors({
      origin: (origin) => config.developmentOrigins.has(origin) ? origin : undefined,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }));
  }

  function add<R extends Route>(
    definition: R,
    handler: (input: Input<R>, c: ApiContext) => Parse<R["success"]["schema"]> | Promise<Parse<R["success"]["schema"]>>,
  ) {
    const route: Route = definition;
    const multipart = route.body?.mediaType === "multipart/form-data";
    const middleware: MiddlewareHandler<HttpEnv>[] = [async (c, next) => {
      const requestTime = now();
      const token = getCookie(c, AdminSessionCookieName);
      const session = route.admin ? auth.requireSession(token, requestTime) : undefined;
      if (session) c.set("adminUsername", session.username);
      if (route.method !== "get") {
        const origin = c.req.header("Origin");
        if (!origin || (origin !== config.siteOrigin && !config.developmentOrigins.has(origin))) {
          throw new ApiFailure("INVALID_ORIGIN");
        }
      }
      await next();
      if (session && token && c.res.ok) {
        const expiry = auth.renew(session);
        if (expiry !== undefined) writeCookie(c, token, Math.max(0, Math.ceil((expiry - now()) / 1000)));
      }
    }];

    if (multipart) middleware.push(queueUpload);
    if (route.body) {
      middleware.push(bodyLimit({
        maxSize: multipart ? 11 * 1024 * 1024 : 32 * 1024,
        onError: (c) => errorResponse(c, new ApiFailure("INVALID_REQUEST", multipart
          ? { file: "单张图片不能超过 10 MiB。" } : undefined)),
      }));
    }

    const path = route.path.replace("{id}", ":id");
    app.on([route.method.toUpperCase()], [path], ...middleware, async (c: ApiContext) => {
      const inputs = {
        params: route.params ? validate(route.params, c.req.param()) : undefined,
        query: route.query ? validate(route.query, singleValues(new URL(c.req.url).searchParams)) : undefined,
        body: route.body ? validate(route.body.schema, await readBody(c, multipart)) : undefined,
      } as Input<R>;
      const value = await handler(inputs, c);
      if (route.success.status === 204) return c.body(null, 204);
      return c.json(route.success.schema?.parse(value), route.success.status);
    });
  }

  add(stageA.getShop, () => config.shop);
  add(stageA.listCategories, () => catalog.listCategories(false));
  add(stageA.listProducts, ({ query }) => catalog.listProducts(query));
  add(stageA.getProduct, ({ params }) => catalog.getProduct(params.id.toLowerCase()));

  add(stageA.login, async ({ body }, c) => {
    const session = await auth.login(body, visitorIp(c, config.trustProxy), getCookie(c, AdminSessionCookieName));
    writeCookie(c, session.token, Math.ceil((session.expiresAt - now()) / 1000));
    return { username: session.username };
  });
  add(stageA.getSession, (_, c) => ({ username: c.get("adminUsername") }));
  add(stageA.logout, (_, c) => {
    auth.logout(getCookie(c, AdminSessionCookieName));
    writeCookie(c, "", 0);
    return undefined;
  });

  add(stageA.listAdminCategories, () => catalog.listCategories(true));
  add(stageA.createCategory, ({ body }) => catalog.createCategory(body));
  add(stageA.updateCategory, ({ params, body }) => catalog.updateCategory(params.id.toLowerCase(), body));
  add(stageA.deleteCategory, ({ params }) => {
    catalog.deleteCategory(params.id.toLowerCase());
    return undefined;
  });

  add(stageA.listAdminProducts, ({ query }) => catalog.listAdminProducts(query));
  add(stageA.getAdminProduct, ({ params }) => catalog.getAdminProduct(params.id.toLowerCase()));
  add(stageA.createProduct, ({ body }) => catalog.createProduct(body));
  add(stageA.updateProduct, ({ params, body }) => {
    const product = catalog.updateProduct(params.id.toLowerCase(), body);
    images.cleanup();
    return product;
  });
  add(stageA.deleteProduct, ({ params }) => {
    catalog.deleteProduct(params.id.toLowerCase());
    images.cleanup();
    return undefined;
  });

  add(stageA.uploadImage, ({ body }) => images.upload(body.file));
  app.get("/uploads/:filename", async (c) => {
    const stream = await images.read(c.req.param("filename"));
    if (!stream) return c.notFound();
    const headers = {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (c.req.raw.method === "HEAD") {
      await stream.cancel();
      return c.body(null, 200, headers);
    }
    // FileHandle 返回的是 Node 的 Web Stream，运行时可直接交给 Response。
    return c.body(stream as unknown as ReadableStream<Uint8Array>, 200, headers);
  });

  return {
    app,
    cleanup() {
      images.cleanup();
      auth.cleanup();
    },
  };
}
