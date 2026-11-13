import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import sharp from "sharp";
import {
  AdminImageSchema,
  AdminProductSchema,
  AdminSessionSchema,
  ApiErrorSchema,
  CategoryListSchema,
  CategorySchema,
  ProductDetailSchema,
  ProductPageSchema,
  ShopSchema,
} from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";

const origin = "http://localhost:5173";
const credentials = { username: "test-owner", password: "test-fixture-password" };
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const loginWindow = 15 * 60 * 1000;
const wrongCredentials = { ...credentials, password: "incorrect" };

function connection(ip: string) {
  const socket = new Socket();
  Object.defineProperty(socket, "remoteAddress", { value: ip });
  return { incoming: new IncomingMessage(socket) };
}

function fixture(t: TestContext, env: NodeJS.ProcessEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-order-"));
  const dbPath = join(dir, "store.sqlite");
  const db = openDatabase(dbPath);
  const uploadDir = join(dir, "uploads");
  let timestamp = Date.UTC(2026, 10, 12);
  const config = loadConfig({
    DEV_ALLOWED_ORIGINS: "http://localhost:5174",
    UPLOAD_DIR: uploadDir,
    SHOP_NAME: "威马五金测试店",
    SHOP_PHONE: "0755-12345678",
    ...env,
  });
  const { app, cleanup } = createApp(db, config, () => timestamp);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  let cookie = "";
  function request(path: string, method = "GET", body?: unknown, requestOrigin = origin) {
    const headers = new Headers({ Origin: requestOrigin });
    if (cookie) headers.set("Cookie", cookie);
    if (body !== undefined && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
    return app.request(path, {
      method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function login(requestOrigin = origin) {
    const response = await request("/api/admin/login", "POST", credentials, requestOrigin);
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("Set-Cookie");
    assert.ok(setCookie);
    cookie = setCookie.split(";")[0];
    return response;
  }

  return {
    db, dbPath, uploadDir, app, request, login, cleanup,
    advance(milliseconds: number) { timestamp += milliseconds; },
  };
}

async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = ApiErrorSchema.parse(await response.json());
  assert.equal(body.code, code);
  return body;
}

test("管理员会话校验来源、续期、过期和退出", async (t) => {
  const { app, db, request, login, advance } = fixture(t);
  await setAdministrator(db, credentials);
  await error(await request("/api/admin/session"), 401, "UNAUTHENTICATED");
  await error(await request("/api/admin/login", "POST", credentials, "http://localhost:5175"), 400, "INVALID_ORIGIN");
  const invalid = await error(await request("/api/admin/login", "POST", { username: "", password: "" }), 400, "INVALID_REQUEST");
  assert.ok(invalid.code === "INVALID_REQUEST" && invalid.fieldErrors?.password);

  const preflight = await app.request("/api/admin/products/a", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5174", "Access-Control-Request-Method": "DELETE" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "http://localhost:5174");
  assert.equal(preflight.headers.get("Access-Control-Allow-Credentials"), "true");

  const signedIn = await login("http://localhost:5174");
  assert.deepEqual(AdminSessionSchema.parse(await signedIn.json()), { username: credentials.username });
  assert.match(signedIn.headers.get("Set-Cookie") ?? "", /HttpOnly/i);
  assert.match(signedIn.headers.get("Set-Cookie") ?? "", /Max-Age=2592000/i);
  assert.match(signedIn.headers.get("Set-Cookie") ?? "", /SameSite=Lax/i);
  assert.equal(signedIn.headers.get("Cache-Control"), "no-store");
  advance(29 * day);
  const renewal = await request("/api/admin/session");
  assert.equal(renewal.status, 200);
  assert.match(renewal.headers.get("Set-Cookie") ?? "", /Max-Age=2592000/i);
  advance(29 * day);
  assert.equal((await request("/api/admin/session")).status, 200);
  advance(30 * day);
  await error(await request("/api/admin/session"), 401, "UNAUTHENTICATED");
  await login();
  const logout = await request("/api/admin/logout", "POST");
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("Set-Cookie") ?? "", /Max-Age=0/i);
  await error(await request("/api/admin/session"), 401, "UNAUTHENTICATED");
  await login();
  await setAdministrator(db, credentials);
  await error(await request("/api/admin/session"), 401, "UNAUTHENTICATED");
});

function loginFrom(app: ReturnType<typeof createApp>["app"], ip: string, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Origin", origin);
  requestHeaders.set("Content-Type", "application/json");
  return (body: typeof credentials) => app.request("/api/admin/login", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  }, connection(ip));
}

test("登录限流按 TCP 地址隔离，默认忽略转发头，成功后清零", async (t) => {
  const { app, db, advance } = fixture(t);
  await setAdministrator(db, credentials);
  const loginA = loginFrom(app, "192.0.2.1");
  const loginB = loginFrom(app, "192.0.2.2");

  // 成功前后的失败次数各自统计，成功请求也不会计入失败次数。
  await error(await loginA(wrongCredentials), 401, "INVALID_CREDENTIALS");
  assert.equal((await loginA(credentials)).status, 200);
  for (let index = 0; index < 10; index += 1) {
    const spoofed = loginFrom(app, "192.0.2.1", {
      "X-Forwarded-For": `198.51.100.${index + 1}`,
      "X-Real-IP": `203.0.113.${index + 1}`,
    });
    await error(await spoofed(wrongCredentials), 401, "INVALID_CREDENTIALS");
  }
  await error(await loginFrom(app, "::ffff:192.0.2.1", {
    "X-Forwarded-For": "192.0.2.2",
    "X-Real-IP": "192.0.2.2",
  })(credentials), 429, "TOO_MANY_REQUESTS");
  assert.equal((await loginB(credentials)).status, 200);
  await error(await loginA(credentials), 429, "TOO_MANY_REQUESTS");
  advance(loginWindow);
  assert.equal((await loginA(credentials)).status, 200);
});

test("可信反向代理使用转发链最右侧的地址，并支持 X-Real-IP", async (t) => {
  const { app, db } = fixture(t, { TRUST_PROXY: "true" });
  await setAdministrator(db, credentials);
  for (let index = 0; index < 10; index += 1) {
    await error(await loginFrom(app, "127.0.0.1", {
      "X-Forwarded-For": `198.51.100.${index + 1}, 192.0.2.1`,
      "X-Real-IP": "192.0.2.2",
    })(wrongCredentials), 401, "INVALID_CREDENTIALS");
  }
  await error(await loginFrom(app, "127.0.0.1", { "X-Real-IP": "192.0.2.1" })(credentials), 429, "TOO_MANY_REQUESTS");
  assert.equal((await loginFrom(app, "127.0.0.1", { "X-Real-IP": "192.0.2.2" })(credentials)).status, 200);
});

test("全站 15 分钟内累计 100 次失败后限制其他地址，成功登录不清除全站计数", async (t) => {
  const { app, db, advance } = fixture(t);
  await setAdministrator(db, credentials);
  const owner = loginFrom(app, "203.0.113.1");
  for (let index = 1; index <= 100; index += 1) {
    await error(await loginFrom(app, `192.0.2.${index}`)(wrongCredentials), 401, "INVALID_CREDENTIALS");
    if (index === 50) assert.equal((await owner(credentials)).status, 200);
  }
  await error(await owner(credentials), 429, "TOO_MANY_REQUESTS");
  advance(loginWindow);
  assert.equal((await owner(credentials)).status, 200);
});

test("生产环境只接受站点来源并设置 Secure Cookie", async (t) => {
  const { db, uploadDir } = fixture(t);
  await setAdministrator(db, credentials);
  const { app } = createApp(db, loadConfig({
    NODE_ENV: "production",
    SITE_ORIGIN: "https://shop.example.test",
    DEV_ALLOWED_ORIGINS: origin,
    UPLOAD_DIR: uploadDir,
  }));
  const login = (source: string) => app.request("https://shop.example.test/api/admin/login", {
    method: "POST",
    headers: { Origin: source, "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  await error(await login(origin), 400, "INVALID_ORIGIN");
  const response = await login("https://shop.example.test");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie") ?? "", /; Secure/i);
});

test("目录、图片和上下架在公开与后台接口中一致", async (t) => {
  const { db, dbPath, request, login, advance, uploadDir, cleanup } = fixture(t);
  await setAdministrator(db, credentials);
  await login();

  const shop = ShopSchema.parse(await (await request("/api/shop")).json());
  assert.equal(shop.phone, "0755-12345678");
  const createCategory = async (name: string, sortOrder = 0) => {
    const response = await request("/api/admin/categories", "POST", { name, sortOrder });
    assert.equal(response.status, 201);
    return CategorySchema.parse(await response.json());
  };
  const tools = await createCategory("工具");
  advance(1);
  const parts = await createCategory("零件");
  await error(await request("/api/admin/categories", "POST", { name: " 工具 " }), 409, "CATEGORY_NAME_EXISTS");
  assert.deepEqual(CategoryListSchema.parse(await (await request("/api/categories")).json()), { items: [], total: 0 });
  assert.deepEqual(CategoryListSchema.parse(await (await request("/api/admin/categories")).json()).items.map(({ id }) => id), [tools.id, parts.id]);
  await error(await request("/api/categories?page=1"), 400, "INVALID_REQUEST");
  const renamed = await request(`/api/admin/categories/${parts.id}`, "PATCH", { name: "零配件", sortOrder: 5 });
  assert.equal(CategorySchema.parse(await renamed.json()).name, "零配件");

  const image = await sharp({ create: { width: 2100, height: 1200, channels: 3, background: "red" } }).png().toBuffer();
  function form(bytes: Uint8Array, type = "image/png") {
    const data = new FormData();
    data.append("file", new Blob([new Uint8Array(bytes)], { type }), "photo");
    return data;
  }
  await error(await request("/api/admin/images", "POST", form(image, "image/jpeg")), 400, "INVALID_IMAGE");
  await error(await request("/api/admin/images", "POST", form(new Uint8Array(10 * 1024 * 1024 + 1))), 400, "INVALID_REQUEST");
  const [main, detail, unused] = await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await request("/api/admin/images", "POST", form(image));
    assert.equal(response.status, 201);
    return AdminImageSchema.parse(await response.json());
  }));
  const publicImage = await request(main.imageUrl);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("Content-Type"), "image/jpeg");
  assert.match(publicImage.headers.get("Cache-Control") ?? "", /immutable/);
  assert.equal((await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata()).width, 1600);
  const thumbnail = await request(main.thumbnailUrl);
  assert.equal((await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata()).width, 480);
  assert.equal((await request(main.thumbnailUrl, "HEAD")).status, 200);
  assert.equal((await request("/uploads/not-an-image.jpg")).status, 404);

  const createProduct = async (values = {}) => {
    const response = await request("/api/admin/products", "POST", {
      name: "电钻", unit: "把", specifications: "18 V", categoryId: tools.id, priceCents: null, ...values,
    });
    assert.equal(response.status, 201);
    return AdminProductSchema.parse(await response.json());
  };
  const draft = await createProduct();
  assert.equal(draft.brand, "");
  assert.equal(draft.model, "");
  assert.equal(draft.mainImage, null);
  await error(await request(`/api/products/${draft.id}`), 404, "PRODUCT_NOT_FOUND");
  await error(await request(`/api/admin/categories/${tools.id}`, "DELETE"), 409, "CATEGORY_IN_USE");

  const draftPath = `/api/admin/products/${draft.id}`;
  const missingMain = await error(await request(draftPath, "PATCH", { isPublished: true }), 400, "INVALID_REQUEST");
  assert.ok(missingMain.code === "INVALID_REQUEST" && missingMain.fieldErrors?.mainImageId);
  await error(await request(draftPath, "PATCH", { categoryId: randomUUID() }), 404, "CATEGORY_NOT_FOUND");
  await error(await request(draftPath, "PATCH", { mainImageId: randomUUID() }), 404, "IMAGE_NOT_FOUND");

  const saved = await request(draftPath, "PATCH", {
    mainImageId: main.id, detailImageIds: [detail.id], isPublished: true, brand: "Acme", model: "V18", isOutOfStock: true,
  });
  assert.equal(saved.status, 200);
  assert.equal(AdminProductSchema.parse(await saved.json()).isOutOfStock, true);
  const publicDetail = ProductDetailSchema.parse(await (await request(`/api/products/${draft.id}`)).json());
  assert.deepEqual(publicDetail.detailImages, [{ imageUrl: detail.imageUrl, thumbnailUrl: detail.thumbnailUrl }]);
  assert.equal(publicDetail.priceCents, null);
  assert.deepEqual(CategoryListSchema.parse(await (await request("/api/categories")).json()).items.map(({ id }) => id), [tools.id]);

  advance(1);
  const second = await createProduct({ name: "钻头套装", mainImageId: main.id, isPublished: true, priceCents: 8500 });
  const page = async (query = "") => ProductPageSchema.parse(await (await request(`/api/products${query}`)).json());
  assert.deepEqual((await page("?pageSize=1")).items.map(({ id }) => id), [second.id]);
  assert.deepEqual((await page("?pageSize=1&page=2")).items.map(({ id }) => id), [draft.id]);
  assert.equal((await page("?pageSize=1&page=3")).total, 2);
  assert.equal((await page("?q=acme")).items[0].id, draft.id);
  assert.equal((await page("?q=v18")).items[0].id, draft.id);
  assert.equal((await page("?q=%25")).total, 0);
  await error(await request("/api/products?page=1&page=2"), 400, "INVALID_REQUEST");

  assert.equal((await request(draftPath, "PATCH", { isPinned: true, detailImageIds: [] })).status, 200);
  assert.equal((await page()).items[0].id, draft.id);
  assert.equal((await request(detail.imageUrl)).status, 404);
  assert.equal((await request(draftPath, "PATCH", { isPublished: false })).status, 200);
  assert.equal((await request(`/api/products/${draft.id}`)).status, 404);
  assert.equal((await request(draftPath)).status, 200);
  const adminPage = await request("/api/admin/products?isPublished=false&isOutOfStock=true");
  assert.deepEqual((await adminPage.json()).items.map((item: { id: string }) => item.id), [draft.id]);
  assert.equal((await request(draftPath, "DELETE")).status, 204);
  assert.equal(await (await request(main.imageUrl)).arrayBuffer().then((body) => body.byteLength > 0), true);
  await error(await request(draftPath, "DELETE"), 404, "PRODUCT_NOT_FOUND");
  assert.equal((await request(`/api/admin/products/${second.id}`, "DELETE")).status, 204);
  assert.equal((await request(main.imageUrl)).status, 404);
  assert.equal((await page()).total, 0);
  assert.equal((await request(`/api/admin/categories/${tools.id}`, "DELETE")).status, 204);

  advance(day);
  cleanup();
  assert.equal((await request(unused.imageUrl)).status, 404);
  assert.deepEqual(readdirSync(uploadDir), []);
  const reopened = openDatabase(dbPath);
  try {
    assert.ok(reopened.prepare("SELECT version FROM schema_migrations WHERE version = 1").get());
    assert.equal(reopened.prepare("SELECT name FROM categories WHERE id = ?").get(parts.id)?.name, "零配件");
  } finally {
    reopened.close();
  }
});
