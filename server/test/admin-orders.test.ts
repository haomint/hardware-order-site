import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { OrderDetailSchema, OrderPageSchema, OrderReceiptSchema, StageBApiErrorSchema } from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";

const origin = "http://localhost:5173";
const credentials = { username: "test-owner", password: "test-fixture-password" };
const collection = "/api/admin/orders";

async function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-admin-orders-"));
  const db = openDatabase(join(dir, "orders.sqlite"));
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let timestamp = Date.parse("2026-11-13T01:00:00Z");
  const { app } = createApp(db, loadConfig({ UPLOAD_DIR: join(dir, "uploads") }), () => timestamp);
  await setAdministrator(db, credentials);

  const category = randomUUID();
  const image = randomUUID();
  db.prepare("INSERT INTO categories VALUES (?, '工具', 0, ?)").run(category, timestamp);
  db.prepare("INSERT INTO images VALUES (?, NULL)").run(image);
  const items = ["电钻", "钻头", "锤子"].map((name, index) => {
    const productId = randomUUID();
    db.prepare(`
      INSERT INTO products VALUES (?, ?, '', '', ?, 100, '件', '规格', 1, 0, 0, 0, ?, ?)
    `).run(productId, name, category, image, timestamp);
    return { productId, quantity: index + 1 };
  });

  const login = await app.request("/api/admin/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);

  function admin(path: string, patch?: unknown, source = origin) {
    return app.request(path, {
      method: patch === undefined ? "GET" : "PATCH",
      headers: { Cookie: cookie!, Origin: source, "Content-Type": "application/json" },
      body: patch === undefined ? undefined : JSON.stringify(patch),
    });
  }

  async function submit(phone = "13812345678") {
    const response = await app.request("/api/orders", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        items, contactName: "张师傅", phone, deliveryMethod: "delivery", address: "店铺仓库", note: "下午送达",
      }),
    });
    assert.equal(response.status, 201);
    return OrderReceiptSchema.parse(await response.json());
  }

  return { app, admin, submit, db, advance: (ms = 1000) => { timestamp += ms; } };
}

async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const payload = StageBApiErrorSchema.parse(await response.json());
  assert.equal(payload.code, code);
  return payload;
}

async function detail(response: Response) {
  assert.equal(response.status, 200);
  return OrderDetailSchema.parse(await response.json());
}

test("后台订单要求登录，修改校验 Origin，订单不存在时返回 404", async (t) => {
  const { app, admin, submit } = await fixture(t);
  const order = await submit();
  const path = `${collection}/${order.orderNo}`;
  await error(await app.request(collection), 401, "UNAUTHENTICATED");
  await error(await app.request(path), 401, "UNAUTHENTICATED");
  await error(await app.request(path, { method: "PATCH", headers: { Origin: origin } }), 401, "UNAUTHENTICATED");
  await error(await admin(path, { status: "completed" }, "https://elsewhere.example"), 400, "INVALID_ORIGIN");
  await error(await admin(`${collection}/WJ-20261113-9999`), 404, "ORDER_NOT_FOUND");
  const invalid = await error(await admin(`${collection}/wrong`), 400, "INVALID_REQUEST");
  assert.ok(invalid.code === "INVALID_REQUEST" && invalid.fieldErrors?.orderNo);
  const response = await admin(path);
  assert.ok(response.headers.get("Set-Cookie"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const saved = await detail(response);
  assert.equal(saved.address, "店铺仓库");
  assert.equal(saved.note, "下午送达");
  assert.deepEqual(saved.items, order.items);
});

test("列表按时间和订单号倒序，按状态、收款、日期及关键词筛选并分页", async (t) => {
  const { admin, submit, db, advance } = await fixture(t);
  const first = await submit();
  advance();
  const second = await submit("13900006666");
  const third = await submit("13900007777");
  await detail(await admin(`${collection}/${second.orderNo}`, { status: "completed" }));
  await detail(await admin(`${collection}/${third.orderNo}`, { paymentStatus: "paid" }));
  db.exec("DELETE FROM products");
  const list = async (search = "") => {
    const response = await admin(collection + search);
    assert.equal(response.status, 200);
    return OrderPageSchema.parse(await response.json());
  };
  const all = await list();
  assert.deepEqual(all.items.map(({ orderNo }) => orderNo), [third.orderNo, second.orderNo, first.orderNo]);
  assert.deepEqual(all.items[0].itemsPreview, [{ name: "电钻", quantity: 1 }, { name: "钻头", quantity: 2 }]);
  assert.equal(all.items[0].itemCount, 3);
  assert.deepEqual((await detail(await admin(`${collection}/${second.orderNo}`))).items, second.items);
  const filters = new URLSearchParams({ status: "completed", paymentStatus: "unpaid", from: second.createdAt, q: "6666" });
  assert.deepEqual((await list(`?${filters}`)).items.map(({ orderNo }) => orderNo), [second.orderNo]);
  assert.deepEqual((await list(`?q=${third.orderNo.toLowerCase()}`)).items.map(({ orderNo }) => orderNo), [third.orderNo]);
  assert.deepEqual((await list(`?${new URLSearchParams({ to: second.createdAt })}`)).items.map(({ orderNo }) => orderNo), [first.orderNo]);
  const paged = await list("?page=2&pageSize=1");
  assert.deepEqual(paged.items.map(({ orderNo }) => orderNo), [second.orderNo]);
  assert.equal(paged.total, 3);
  assert.deepEqual(await list("?page=4&pageSize=1"), { items: [], total: 3 });
});

test("订单可跨步、回退和恢复，收款和其他字段独立记录修改时间", async (t) => {
  const { admin, submit, advance } = await fixture(t);
  const order = await submit();
  const path = `${collection}/${order.orderNo}`;
  const initial = await detail(await admin(path));
  assert.equal(initial.updatedAt, initial.createdAt);
  assert.equal(initial.statusUpdatedAt, initial.createdAt);
  assert.equal(initial.paymentStatusUpdatedAt, initial.createdAt);
  assert.equal(initial.adminNoteUpdatedAt, null);
  assert.equal(initial.finalTotalUpdatedAt, null);
  assert.equal(initial.cancellationReasonUpdatedAt, null);

  advance();
  const completed = await detail(await admin(path, { status: "completed" }));
  assert.equal(completed.status, "completed");
  assert.equal(completed.paymentStatus, "unpaid");
  assert.equal(completed.paymentStatusUpdatedAt, initial.paymentStatusUpdatedAt);
  assert.notEqual(completed.statusUpdatedAt, initial.statusUpdatedAt);
  const filtered = await admin(`${collection}?paymentStatus=unpaid&status=completed`);
  assert.equal(OrderPageSchema.parse(await filtered.json()).items[0].orderNo, order.orderNo);

  advance();
  const paid = await detail(await admin(path, { paymentStatus: "paid", finalTotalCents: 0, adminNote: "已自提" }));
  assert.equal(paid.statusUpdatedAt, completed.statusUpdatedAt);
  assert.equal(paid.paymentStatusUpdatedAt, paid.updatedAt);
  assert.equal(paid.adminNoteUpdatedAt, paid.updatedAt);
  assert.equal(paid.finalTotalUpdatedAt, paid.updatedAt);
  assert.equal(paid.finalTotalCents, 0);
  advance();
  await error(await admin(path, { cancellationReason: "无效", paymentStatus: "unpaid" }), 409, "ORDER_STATUS_CONFLICT");
  assert.deepEqual(await detail(await admin(path)), paid);
  const missingReason = await error(await admin(path, { status: "cancelled" }), 400, "INVALID_REQUEST");
  assert.ok(missingReason.code === "INVALID_REQUEST" && missingReason.fieldErrors?.cancellationReason);
  const cancelled = await detail(await admin(path, { status: "cancelled", cancellationReason: "录入有误" }));
  assert.equal(cancelled.cancellationReasonUpdatedAt, cancelled.updatedAt);
  advance();
  const amended = await detail(await admin(path, { cancellationReason: "客户改期" }));
  assert.equal(amended.statusUpdatedAt, cancelled.statusUpdatedAt);
  advance();
  const restored = await detail(await admin(path, { status: "pending_contact", finalTotalCents: null, adminNote: "" }));
  assert.equal(restored.cancellationReason, "客户改期");
  assert.equal(restored.cancellationReasonUpdatedAt, amended.cancellationReasonUpdatedAt);
  assert.equal(restored.paymentStatusUpdatedAt, paid.paymentStatusUpdatedAt);
  assert.equal(restored.paymentStatus, "paid");
  assert.equal(restored.finalTotalCents, null);
  assert.equal(restored.finalTotalUpdatedAt, restored.updatedAt);
  assert.equal(restored.adminNoteUpdatedAt, restored.updatedAt);
  advance();
  assert.deepEqual(await detail(await admin(path, { status: "pending_contact", finalTotalCents: null })), restored);
});
