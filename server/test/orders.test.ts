import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  CartLookupResultSchema, OrderReceiptSchema, StageBApiErrorSchema, stageBErrors,
} from "../../shared/index.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";

const origin = "http://localhost:5173";
const payload = { contactName: "张师傅", phone: "13812345678", deliveryMethod: "pickup" };

function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-orders-"));
  const db = openDatabase(join(dir, "orders.sqlite"));
  const config = loadConfig({ UPLOAD_DIR: join(dir, "uploads") });
  let timestamp = Date.parse("2026-11-12T15:59:59.999Z");
  let app = createApp(db, config, () => timestamp).app;
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const categoryId = randomUUID();
  const imageId = randomUUID();
  db.prepare("INSERT INTO categories VALUES (?, '工具', 0, ?)").run(categoryId, timestamp);
  db.prepare("INSERT INTO images VALUES (?, NULL)").run(imageId);
  function product(name: string, price: number | null, published = 1, outOfStock = 0) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO products VALUES (?, ?, '威马', 'WJ-18', ?, ?, '把', '18V', ?, ?, 0, 0, ?, ?)
    `).run(id, name, categoryId, price, published, outOfStock, imageId, timestamp);
    return id;
  }

  function submit(body: unknown, key: string | null = randomUUID(), ip = "192.0.2.1", extra?: HeadersInit) {
    const headers = new Headers({ Origin: origin, "Content-Type": "application/json" });
    if (key !== null) headers.set("Idempotency-Key", key);
    for (const [name, value] of new Headers(extra)) headers.set(name, value);
    const socket = new Socket();
    Object.defineProperty(socket, "remoteAddress", { value: ip });
    return app.request("/api/orders", {
      method: "POST", headers, body: JSON.stringify(body),
    }, { incoming: new IncomingMessage(socket) });
  }

  return {
    db, product, submit,
    get app() { return app; },
    advance(ms: number) { timestamp += ms; },
    restartApp() { app = createApp(db, config, () => timestamp).app; },
    count: () => db.prepare("SELECT COUNT(*) AS count FROM orders").get()?.count,
  };
}

async function failure(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const error = StageBApiErrorSchema.parse(await response.json());
  assert.equal(error.code, code);
  return error;
}

test("购物车按输入顺序刷新，隐藏不可订商品详情，跨域下单允许幂等键", async (t) => {
  const { app, product } = fixture(t);
  const available = product("电钻", 32900);
  const outOfStock = product("钻头", null, 1, 1);
  const hidden = product("未上架", 100, 0);
  const missing = randomUUID();
  const response = await app.request("/api/cart/items", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ productIds: [outOfStock, hidden, missing, available.toUpperCase()] }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { items } = CartLookupResultSchema.parse(await response.json());
  assert.deepEqual(items.map(({ availability }) => availability), ["out_of_stock", "unavailable", "unavailable", "available"]);
  assert.deepEqual(items.slice(1, 3), [
    { productId: hidden, availability: "unavailable" }, { productId: missing, availability: "unavailable" },
  ]);
  assert.equal(items[0].availability === "out_of_stock" && items[0].product.priceCents, null);
  assert.equal(items[3].availability === "available" && items[3].product.priceCents, 32900);
  const preflight = await app.request("/api/orders", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "idempotency-key" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /idempotency-key/i);
});

test("字段错误返回中文，缺货与不可订商品整单拒绝，失败的键可重用", async (t) => {
  const { db, product, submit, count } = fixture(t);
  const stock = product("缺货钻头", 200, 1, 1);
  const hidden = product("下架电钻", 32900, 0);
  const missing = randomUUID();
  const order = { ...payload, items: [stock, hidden, missing].map((productId) => ({ productId, quantity: 1 })) };
  const key = randomUUID();
  const invalid = await failure(await submit({
    ...order, deliveryMethod: "delivery", address: " ", phone: "123", items: [{ productId: stock, quantity: 10000 }],
  }, key), 400, "INVALID_REQUEST");
  assert.ok(invalid.code === "INVALID_REQUEST");
  for (const field of ["items.0.quantity", "phone", "address"]) {
    assert.match(invalid.fieldErrors?.[field] ?? "", /[\u4e00-\u9fff]/);
  }
  const noKey = await failure(await submit(order, null), 400, "INVALID_REQUEST");
  assert.ok(noKey.code === "INVALID_REQUEST" && noKey.fieldErrors?.["Idempotency-Key"]);
  await failure(await submit({ ...order, priceCents: 1 }), 400, "INVALID_REQUEST");
  const unavailable = await failure(await submit(order, key), 409, "ORDER_PRODUCTS_UNAVAILABLE");
  assert.ok(unavailable.code === "ORDER_PRODUCTS_UNAVAILABLE");
  assert.deepEqual(unavailable.unavailableItems, [
    { productId: stock, reason: "out_of_stock" },
    { productId: hidden, reason: "unavailable" },
    { productId: missing, reason: "unavailable" },
  ]);
  assert.equal(count(), 0);
  db.prepare("UPDATE products SET is_out_of_stock = 0 WHERE id = ?").run(stock);
  assert.equal((await submit({ ...order, items: order.items.slice(0, 1) }, key)).status, 201);
  assert.equal(count(), 1);
});

test("当前价格和商品快照入库，幂等重放跨应用重建，订单号按北京时间跨日", async (t) => {
  const { db, product, submit, count, advance, restartApp, app } = fixture(t);
  const priced = product("电钻", 100);
  const negotiable = product("钻头", null);
  db.prepare("UPDATE products SET price_cents = 32900 WHERE id = ?").run(priced);
  const order = { ...payload, contactName: " 张师傅 ", items: [
    { productId: priced, quantity: 2 }, { productId: negotiable, quantity: 3 },
  ] };
  const key = randomUUID();
  const attempts = await Promise.all([submit(order, key), submit(order, key)]);
  assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 201]);
  const [receipt, duplicate] = await Promise.all(attempts.map(async (res) => OrderReceiptSchema.parse(await res.json())));
  assert.deepEqual(duplicate, receipt);
  assert.equal(receipt.orderNo, "WJ-20261112-0001");
  assert.equal(receipt.estimatedTotalCents, 65800);
  assert.deepEqual(receipt.items, [
    { productId: priced, name: "电钻", brand: "威马", model: "WJ-18", unit: "把", unitPriceCents: 32900, quantity: 2, subtotalCents: 65800 },
    { productId: negotiable, name: "钻头", brand: "威马", model: "WJ-18", unit: "把", unitPriceCents: null, quantity: 3, subtotalCents: null },
  ]);
  const stored = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(receipt.orderNo);
  assert.equal(stored?.address, null);
  assert.equal(stored?.status, "pending_contact");
  assert.equal(stored?.payment_status, "unpaid");
  db.prepare("DELETE FROM products WHERE id = ?").run(priced);
  db.prepare("UPDATE products SET name = '改名', price_cents = 300 WHERE id = ?").run(negotiable);
  restartApp();
  const replay = await submit({
    ...order, contactName: "张师傅", address: "自提忽略地址", note: "",
    items: [...order.items].reverse().map((item) => ({ ...item, productId: item.productId.toUpperCase() })),
  }, key.toUpperCase());
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), receipt);
  await failure(await submit({ ...order, note: "有改动" }, key), 409, "IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(count(), 1);
  assert.equal((await app.request(`/api/orders/${receipt.orderNo}`)).status, 404);

  const second = await submit({ ...payload, deliveryMethod: "delivery", address: "仓库", items: [order.items[1]] });
  assert.equal(second.status, 201);
  assert.equal((await second.json()).orderNo, "WJ-20261112-0002");
  advance(1);
  const nextDay = await submit({ ...payload, items: [order.items[1]] });
  assert.equal(nextDay.status, 201);
  assert.equal((await nextDay.json()).orderNo, "WJ-20261113-0001");
});

test("超出安全整数的金额拒绝入库，全为面议时预估金额为零", async (t) => {
  const { product, submit, count } = fixture(t);
  const large = product("高价商品", Number.MAX_SAFE_INTEGER);
  const freeQuote = product("面议商品", null);
  await failure(await submit({
    ...payload, items: [{ productId: large, quantity: 2 }],
  }), 409, "ORDER_TOTAL_TOO_LARGE");
  assert.equal(count(), 0);
  const response = await submit({ ...payload, items: [{ productId: freeQuote, quantity: 2 }] });
  assert.equal(response.status, 201);
  assert.equal(OrderReceiptSchema.parse(await response.json()).estimatedTotalCents, 0);
});

test("下单按访问者 IP 在滚动 10 分钟内允许 20 次，校验失败和重放计入", async (t) => {
  const { product, submit, advance, count } = fixture(t);
  const body = { ...payload, items: [{ productId: product("电钻", 100), quantity: 1 }] };
  const key = randomUUID();
  await failure(await submit(body, key, "192.0.2.1", { Origin: "https://example.test" }), 400, "INVALID_ORIGIN");
  await failure(await submit({}, key), 400, "INVALID_REQUEST");
  advance(1000);
  assert.equal((await submit(body, key)).status, 201);
  for (let index = 0; index < 18; index += 1) {
    assert.equal((await submit(body, key)).status, 200);
  }
  const blocked = await failure(await submit(body, key, "192.0.2.1", {
    "X-Forwarded-For": "192.0.2.2",
  }), 429, "TOO_MANY_REQUESTS");
  assert.equal(blocked.message, stageBErrors.TOO_MANY_REQUESTS.message);
  assert.equal((await submit(body, randomUUID(), "192.0.2.2")).status, 201);
  advance(599_000);
  assert.equal((await submit(body, key)).status, 200);
  await failure(await submit(body, key), 429, "TOO_MANY_REQUESTS");
  assert.equal(count(), 2);
});
