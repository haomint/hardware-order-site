import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { serve } from "@hono/node-server";
import {
  OrderDetailWithNotificationSchema, OrderPageWithNotificationSchema, OrderReceiptSchema, StageCApiErrorSchema,
  notificationRetryTiming,
} from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";
import { createWecomSender } from "../src/wecom.ts";

const env = {
  WECOM_CORP_ID: "test-corp", WECOM_AGENT_ID: "1000002", WECOM_SECRET: "test-secret", WECOM_USER_ID: "test-owner",
};
const tokenResponse = (token = "test-token") => Response.json({ errcode: 0, access_token: token, expires_in: 7200 });
const origin = "http://localhost:5173";
const collection = "/api/admin/orders";

function fixture(t: TestContext, request: typeof fetch, variables: NodeJS.ProcessEnv = env) {
  const dir = mkdtempSync(join(tmpdir(), "hardware-notifications-"));
  const db = openDatabase(join(dir, "orders.sqlite"));
  let time = Date.parse("2026-11-13T05:00:00Z");
  const now = () => time;
  const config = loadConfig({ ...variables, UPLOAD_DIR: join(dir, "uploads") });
  const build = () => createApp(db, config, now, request);
  const { app, notifications } = build();
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const category = randomUUID();
  const image = randomUUID();
  db.prepare("INSERT INTO categories VALUES (?, '工具', 0, ?)").run(category, time);
  db.prepare("INSERT INTO images VALUES (?, NULL)").run(image);
  const items = ["电钻", "钻头", "锤子", "扳手"].map((name, index) => {
    const productId = randomUUID();
    db.prepare("INSERT INTO products VALUES (?, ?, '', '', ?, 100, '件', '规格', 1, 0, 0, 0, ?, ?)")
      .run(productId, name, category, image, time);
    return { productId, quantity: index + 1 };
  });
  const orderKey = randomUUID();
  const submit = (key: string = orderKey) => app.request("/api/orders", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      items, contactName: "张三", phone: "13812345678", deliveryMethod: "delivery", address: "测试配送地址",
    }),
  });
  return {
    app, db, submit, notifications, build,
    advance(ms: number) { time += ms; },
    record: () => db.prepare("SELECT * FROM order_notifications").get(),
    attempts: () => db.prepare("SELECT * FROM order_notification_attempts ORDER BY attempt_no").all(),
  };
}

test("订单提交后才发送，幂等重放只保留一条提醒，消息隐藏联系方式", async (t) => {
  let content = "";
  let calls = 0;
  const f = fixture(t, async (input, options) => {
    calls += 1;
    assert.equal(f.db.isTransaction, false);
    const url = new URL(String(input));
    assert.equal(url.hostname, "qyapi.weixin.qq.com");
    if (url.pathname.endsWith("/gettoken")) {
      assert.equal(url.searchParams.get("corpsecret"), env.WECOM_SECRET);
      return tokenResponse();
    }
    const body = JSON.parse(String(options?.body));
    assert.equal(body.touser, env.WECOM_USER_ID);
    assert.equal(body.agentid, 1000002);
    content = body.text.content;
    return Response.json({ errcode: 0 });
  });
  const response = await f.submit();
  assert.equal(response.status, 201);
  const { orderNo } = OrderReceiptSchema.parse(await response.json());
  assert.equal((await f.submit()).status, 200);
  assert.equal(calls, 0);
  assert.equal(f.record()?.status, "retrying");
  await Promise.all([f.notifications.processDue(), f.notifications.processDue()]);
  assert.equal(calls, 2);
  assert.equal(f.record()?.status, "sent");
  assert.equal(f.attempts().length, 1);
  assert.match(content, new RegExp(orderNo));
  assert.match(content, /张师傅｜尾号：5678/);
  assert.match(content, /电钻 ×1、钻头 ×2、锤子 ×3 等 4 类/);
  assert.match(content, /状态：待联系/);
  assert.doesNotMatch(content, /13812345678|测试配送地址|test-secret|test-token|张三|扳手/);
});

async function adminCookie(f: ReturnType<typeof fixture>) {
  const credentials = { username: "test-owner", password: "test-fixture-password" };
  await setAdministrator(f.db, credentials);
  const response = await f.app.request("/api/admin/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function submittedOrder(f: ReturnType<typeof fixture>, key?: string) {
  const response = await f.submit(key);
  assert.equal(response.status, 201);
  return OrderReceiptSchema.parse(await response.json());
}

async function errorCode(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const result = StageCApiErrorSchema.parse(await response.json());
  assert.equal(result.code, code);
  return result;
}

async function detail(response: Response, status = 200) {
  assert.equal(response.status, status);
  return OrderDetailWithNotificationSchema.parse(await response.json());
}

test("重发接口鉴权、校验来源和幂等键，旧订单与缺配置订单可区分", async (t) => {
  const f = fixture(t, async () => { assert.fail("unexpected request"); }, {});
  const order = await submittedOrder(f);
  const orderPath = `${collection}/${order.orderNo}`;
  const path = orderPath + "/notifications/retry";
  await errorCode(await f.app.request(path, { method: "POST" }), 401, "UNAUTHENTICATED");
  const headers = { Cookie: await adminCookie(f), Origin: origin, "Idempotency-Key": randomUUID() };
  const retry = (url = path, options?: RequestInit) => f.app.request(url, { method: "POST", headers, ...options });
  const missingKey = { Cookie: headers.Cookie, Origin: origin };
  const invalid = await errorCode(await retry(path, { headers: missingKey }), 400, "INVALID_REQUEST");
  assert.ok(invalid.code === "INVALID_REQUEST" && invalid.fieldErrors?.["Idempotency-Key"]);
  await errorCode(await retry(path, { headers: { ...headers, Origin: "https://elsewhere.example" } }), 400, "INVALID_ORIGIN");
  await errorCode(await retry(path, { body: "{}" }), 400, "INVALID_REQUEST");
  await errorCode(await retry(`${collection}/WJ-20261113-9999/notifications/retry`), 404, "ORDER_NOT_FOUND");
  assert.equal((await detail(await f.app.request(orderPath, { headers }))).notificationStatus, "failed");

  const accepted = await detail(await retry(), 202);
  assert.equal(accepted.notificationStatus, "retrying");
  assert.equal(accepted.notificationLastAttemptAt, null);
  await f.notifications.processDue();
  const failed = await detail(await retry(), 202);
  assert.equal(failed.notificationStatus, "failed");
  assert.equal(failed.notificationLastAttemptAt, null);
  assert.equal(f.attempts().length, 0);

  const old = await submittedOrder(f, randomUUID());
  f.db.prepare("DELETE FROM order_notifications WHERE order_no = ?").run(old.orderNo);
  const oldPath = `${collection}/${old.orderNo}`;
  await errorCode(await retry(oldPath + "/notifications/retry"), 409, "NOTIFICATION_NOT_RETRYABLE");
  const oldDetail = await detail(await f.app.request(oldPath, { headers }));
  assert.equal(oldDetail.notificationStatus, null);
  assert.equal(oldDetail.notificationLastAttemptAt, null);
  const response = await f.app.request(collection, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual(OrderPageWithNotificationSchema.parse(await response.json()).items.map(
    ({ notificationStatus }) => notificationStatus,
  ), [null, "failed"]);
});

test("失败后手动重发一次，跨 HTTP 并发和重建后重放都返回当前完整详情", async (t) => {
  let calls = 0;
  const f = fixture(t, async (input) => {
    if (String(input).includes("/gettoken")) return tokenResponse();
    return Response.json({ errcode: ++calls === 1 ? 60020 : 0 });
  });
  const order = await submittedOrder(f);
  const cookie = await adminCookie(f);
  const orderPath = `${collection}/${order.orderNo}`;
  const path = orderPath + "/notifications/retry";
  await f.notifications.processDue();
  const original = await detail(await f.app.request(orderPath, { headers: { Cookie: cookie } }));
  assert.equal(original.notificationStatus, "failed");
  assert.equal(original.notificationLastAttemptAt, order.createdAt);
  f.advance(2000);

  const port = await new Promise<number>((resolve, reject) => {
    const server = serve({ fetch: f.app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve(info.port));
    server.once("error", reject);
    t.after(() => new Promise<void>((closed) => server.close(() => closed())));
  });
  const key = randomUUID();
  const retry = (idempotencyKey: string) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { Cookie: cookie, Origin: origin, "Idempotency-Key": idempotencyKey },
  });
  const [one, two] = await Promise.all([retry(key), retry(key.toUpperCase())]);
  for (const response of [one, two]) {
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.ok(response.headers.get("Set-Cookie"));
    assert.deepEqual(await detail(response, 202), { ...original, notificationStatus: "retrying" });
  }
  const rejectedKey = randomUUID();
  await errorCode(await retry(rejectedKey), 409, "NOTIFICATION_NOT_RETRYABLE");
  assert.equal(f.db.prepare("SELECT count(*) AS count FROM order_notification_retry_keys").get()?.count, 1);

  const rebuilt = f.build();
  await Promise.all([rebuilt.notifications.processDue(), rebuilt.notifications.processDue()]);
  const headers = { Cookie: cookie, Origin: origin, "Idempotency-Key": key };
  const sent = await detail(await rebuilt.app.request(path, { method: "POST", headers }), 202);
  assert.deepEqual(sent, {
    ...original, notificationStatus: "sent",
    notificationLastAttemptAt: new Date(Date.parse(order.createdAt) + 2000).toISOString(),
  });
  await errorCode(await retry(rejectedKey), 409, "NOTIFICATION_NOT_RETRYABLE");
  await rebuilt.notifications.processDue();
  assert.equal(calls, 2);
  assert.deepEqual(f.attempts().map(({ failure_code }) => failure_code), ["WECOM_60020", null]);
  const patched = await detail(await rebuilt.app.request(orderPath, {
    method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed", paymentStatus: "paid" }),
  }));
  assert.equal(patched.notificationStatus, "sent");
  assert.equal(patched.notificationLastAttemptAt, sent.notificationLastAttemptAt);
});

test("手动重发在截止时间内不退避，过期和晚到结果不会覆盖新一轮", async (t) => {
  let calls = 0;
  let complete: ((result: Response) => void) | undefined;
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const f = fixture(t, async (input, init) => {
    assert.ok(init?.signal);
    if (String(input).includes("/gettoken")) return tokenResponse();
    calls += 1;
    if (calls === 1) return Response.json({ errcode: 60020 });
    if (calls === 2) return new Promise((resolve) => {
      complete = resolve;
      markStarted();
    });
    return Response.json({ errcode: -1 });
  });
  const order = await submittedOrder(f);
  const cookie = await adminCookie(f);
  const orderPath = `${collection}/${order.orderNo}`;
  const retry = (key: string = randomUUID()) => f.app.request(orderPath + "/notifications/retry", {
    method: "POST", headers: { Cookie: cookie, Origin: origin, "Idempotency-Key": key },
  });
  await f.notifications.processDue();
  const manualTimeout = notificationRetryTiming.maxProcessingSeconds * 1000;
  await detail(await retry(), 202);
  f.advance(manualTimeout);
  await f.build().notifications.processDue();
  assert.equal(calls, 1);
  assert.equal(f.record()?.failure_code, "NOTIFICATION_DEADLINE_EXCEEDED");

  const firstKey = randomUUID();
  await detail(await retry(firstKey), 202);
  const active = f.notifications.processDue();
  await Promise.race([started, active]);
  assert.ok(complete);
  f.advance(manualTimeout);
  assert.equal((await detail(await retry(firstKey), 202)).notificationStatus, "failed");
  const candidates = [randomUUID(), randomUUID()];
  const responses = await Promise.all(candidates.map(retry));
  assert.deepEqual(responses.map(({ status }) => status).sort(), [202, 409]);
  const acceptedIndex = responses.findIndex(({ status }) => status === 202);
  const nextKey = candidates[acceptedIndex];
  assert.equal((await detail(responses[acceptedIndex], 202)).notificationStatus, "retrying");
  await errorCode(responses[1 - acceptedIndex], 409, "NOTIFICATION_NOT_RETRYABLE");
  complete(Response.json({ errcode: 0 }));
  await active;
  assert.equal(f.record()?.status, "retrying");
  await f.notifications.processDue();
  assert.equal((await detail(await retry(nextKey), 202)).notificationStatus, "failed");
  assert.deepEqual(f.attempts().map(({ failure_code }) => failure_code),
    ["WECOM_60020", "NOTIFICATION_DEADLINE_EXCEEDED", "WECOM_-1"]);
  f.advance(600_000);
  await f.notifications.processDue();
  assert.equal(calls, 3);
});

test("网络失败最多自动重试三次，结果入库，重建处理器后继续", async (t) => {
  let calls = 0;
  const f = fixture(t, async () => {
    calls += 1;
    throw new Error("url containing test-secret");
  });
  assert.equal((await f.submit()).status, 201);
  await f.notifications.processDue();
  assert.equal(f.record()?.status, "retrying");
  const { notifications } = f.build();
  await notifications.processDue();
  assert.equal(calls, 1);
  for (const delay of [30_000, 120_000, 600_000]) {
    f.advance(delay);
    await notifications.processDue();
  }
  assert.equal(f.record()?.status, "failed");
  assert.equal(calls, 4);
  assert.deepEqual(f.attempts().map((attempt) => attempt.failure_code), Array(4).fill("WECOM_REQUEST_FAILED"));
  assert.equal(f.db.prepare("SELECT count(*) AS count FROM orders").get()?.count, 1);
});

test("缺少配置直接记失败，企业可信 IP 错误只记录错误码", async (t) => {
  const absent = fixture(t, async () => { assert.fail("unexpected request"); }, {});
  assert.equal((await absent.submit()).status, 201);
  assert.equal(absent.record()?.status, "failed");
  assert.equal(absent.record()?.last_attempt_at, null);
  assert.equal(absent.attempts().length, 0);

  const configured = fixture(t, async () => Response.json({ errcode: 60020, errmsg: "secret omitted" }));
  assert.equal((await configured.submit()).status, 201);
  await configured.notifications.processDue();
  assert.equal(configured.record()?.status, "failed");
  assert.equal(configured.attempts()[0].failure_code, "WECOM_60020");
});

test("企业微信令牌在有效期内复用，失效或过期时刷新", async () => {
  const config = loadConfig(env).wecom;
  assert.ok(config);
  let now = 0;
  let tokens = 0;
  let invalid = false;
  const send = createWecomSender(config, () => now, async (input, init) => {
    assert.ok(init?.signal);
    const url = new URL(String(input));
    if (url.pathname.endsWith("/gettoken")) return tokenResponse(`token-${++tokens}`);
    if (invalid) {
      invalid = false;
      return Response.json({ errcode: 42001 });
    }
    assert.equal(url.searchParams.get("access_token"), `token-${tokens}`);
    return Response.json({ errcode: 0 });
  });
  await send("测试");
  await send("测试");
  assert.equal(tokens, 1);
  invalid = true;
  await send("测试");
  assert.equal(tokens, 2);
  now += 7200_000;
  await send("测试");
  assert.equal(tokens, 3);
});
