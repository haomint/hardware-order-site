import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ApiErrorSchema, ShopSchema } from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";

const origin = "http://localhost:5173";
const publicPath = "/api/shop";
const adminPath = "/api/admin/shop";

async function readShop(response: Response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return ShopSchema.parse(await response.json());
}

test("后台店铺资料要求登录，写入校验来源和字段，保存后商城立即读到新资料", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hardware-shop-"));
  const db = openDatabase(":memory:");
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const { app } = createApp(db, loadConfig({ UPLOAD_DIR: dir }));
  const initial = { name: "威马五金", phone: "", wechatContactText: "" };
  assert.deepEqual(await readShop(await app.request(publicPath)), initial);

  const patch = (body: unknown, cookie = "", source = origin) => app.request(adminPath, {
    method: "PATCH", headers: { Origin: source, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const read = (cookie: string) => app.request(adminPath, { headers: { Cookie: cookie } });
  assert.equal((await app.request(adminPath)).status, 401);
  assert.equal((await patch({ name: "无权限" })).status, 401);

  const credentials = { username: "test-owner", password: "fixture-password" };
  await setAdministrator(db, credentials);
  const login = await app.request("/api/admin/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(credentials),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  const admin = await read(cookie);
  assert.ok(admin.headers.get("Set-Cookie"));
  assert.deepEqual(await readShop(admin), initial);

  const blocked = await patch({ name: "来源错误" }, cookie, "https://elsewhere.example");
  assert.equal(blocked.status, 400);
  assert.equal(ApiErrorSchema.parse(await blocked.json()).code, "INVALID_ORIGIN");
  for (const body of [{}, { name: "   " }, { extra: "意外字段" }, { phone: null }]) {
    const invalid = await patch(body, cookie);
    assert.equal(invalid.status, 400);
    assert.equal(ApiErrorSchema.parse(await invalid.json()).code, "INVALID_REQUEST");
  }
  const invalidPhone = await patch({ name: "不应部分保存", phone: "13800000000（微信同号）" }, cookie);
  assert.equal(invalidPhone.status, 400);
  const error = ApiErrorSchema.parse(await invalidPhone.json());
  assert.ok(error.code === "INVALID_REQUEST" && error.fieldErrors?.phone?.includes("联系电话"));
  assert.deepEqual(await readShop(await read(cookie)), initial);

  const updated = await patch({ name: "  威马工具商行  ", phone: " +86 (0755) 1234-5678 " }, cookie);
  assert.ok(updated.headers.get("Set-Cookie"));
  const current = { name: "威马工具商行", phone: "+86 (0755) 1234-5678", wechatContactText: "" };
  assert.deepEqual(await readShop(updated), current);
  assert.deepEqual(await readShop(await app.request(publicPath)), current);

  const note = "微信号：weima\n备注：订货";
  assert.deepEqual(await readShop(await patch({ wechatContactText: `  ${note}  ` }, cookie)),
    { ...current, wechatContactText: note });
  assert.deepEqual(await readShop(await patch({ phone: "", wechatContactText: "" }, cookie)), { ...current, phone: "" });
  assert.deepEqual(await readShop(await app.request(publicPath)), { ...current, phone: "" });
});

test("每个数据库首次从环境变量初始化，后台保存后重开数据库仍优先读取已保存值", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hardware-shop-restart-"));
  const file = join(dir, "test.sqlite");
  const env = { UPLOAD_DIR: join(dir, "uploads"), DATABASE_PATH: file };
  let db = openDatabase(file);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const first = loadConfig({
    ...env, SHOP_NAME: "  测试店  ", SHOP_PHONE: "0755-87654321", SHOP_WECHAT_CONTACT_TEXT: "欢迎联系\n请备注订货",
  });
  const current = { name: "测试店", phone: "0755-87654321", wechatContactText: "欢迎联系\n请备注订货" };
  let { app } = createApp(db, first);
  assert.deepEqual(await readShop(await app.request(publicPath)), current);

  db.close();
  db = openDatabase(file);
  const changedEnv = loadConfig({ ...env, SHOP_NAME: "环境改名", SHOP_PHONE: "13900000000" });
  ({ app } = createApp(db, changedEnv));
  assert.deepEqual(await readShop(await app.request(publicPath)), current);

  const credentials = { username: "test-owner", password: "fixture-password" };
  await setAdministrator(db, credentials);
  const login = await app.request("/api/admin/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  assert.deepEqual(await readShop(await app.request(adminPath, {
    method: "PATCH", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "后台保存", phone: "" }),
  })), { ...current, name: "后台保存", phone: "" });

  db.close();
  db = openDatabase(file);
  ({ app } = createApp(db, loadConfig({ ...env, SHOP_NAME: "" })));
  assert.deepEqual(await readShop(await app.request(publicPath)), { ...current, name: "后台保存", phone: "" });
  assert.deepEqual(await readShop(await app.request(adminPath, { headers: { Cookie: cookie } })),
    { ...current, name: "后台保存", phone: "" });
});
