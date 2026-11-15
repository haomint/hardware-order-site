import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { OrderReceiptSchema } from "../../shared/index.ts";
import { setAdministrator } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { createApp } from "../src/http.ts";
import { createWecomSender } from "../src/wecom.ts";

const env = {
  WECOM_CORP_ID: "test-corp", WECOM_AGENT_ID: "1000002", WECOM_SECRET: "test-secret", WECOM_USER_ID: "test-owner",
};
const tokenResponse = (token = "test-token") => Response.json({ errcode: 0, access_token: token, expires_in: 7200 });

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
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", "Idempotency-Key": key },
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

function notificationContent(options?: RequestInit) {
  return (JSON.parse(String(options?.body)) as { text: { content: string } }).text.content;
}

test("待联系满两小时才补发，每单一次，重启后与新单提醒分开记录", async (t) => {
  const messages: string[] = [];
  const f = fixture(t, async (input, options) => {
    if (String(input).includes("/gettoken")) return tokenResponse();
    messages.push(notificationContent(options));
    return Response.json({ errcode: 0 });
  });
  const created = await f.submit();
  assert.equal(created.status, 201);
  const order = OrderReceiptSchema.parse(await created.json());
  await f.notifications.processDue();
  const newOrderNotice = f.record();
  const before = f.db.prepare("SELECT * FROM orders").get();
  f.advance(7_200_000 - 1);
  await f.notifications.processDue();
  assert.equal(messages.length, 1);
  f.advance(1);
  const restarted = f.build().notifications;
  await Promise.all([restarted.processDue(), restarted.processDue()]);
  await f.build().notifications.processDue();
  assert.deepEqual(messages.slice(1), [`【待联系超时】订货单 #${order.orderNo}\n请登录后台查看订单并联系客户。`]);
  assert.deepEqual(f.record(), newOrderNotice);
  assert.deepEqual(f.db.prepare("SELECT * FROM orders").get(), before);
  const reminder = f.db.prepare("SELECT * FROM order_timeout_reminders").get();
  assert.ok(reminder?.finished_at);
  assert.equal(reminder.failure_code, null);
});

test("夜间不发，早八点补发，处理过的订单重新进入待联系后重新计时", async (t) => {
  const messages: string[] = [];
  const f = fixture(t, async (input, options) => {
    if (String(input).includes("/gettoken")) return tokenResponse();
    messages.push(notificationContent(options));
    return Response.json({ errcode: 0 });
  });
  const created = await f.submit();
  const order = OrderReceiptSchema.parse(await created.json());
  const waiting = OrderReceiptSchema.parse(await (await f.submit(randomUUID())).json());
  await f.notifications.processDue(); // 北京时间 13:00
  await f.notifications.processDue();
  f.advance(8 * 3_600_000); // 21:00
  await f.notifications.processDue();
  assert.equal(messages.length, 2);
  const { notifications } = f.build();
  f.advance(11 * 3_600_000 - 1);
  await notifications.processDue();
  assert.equal(messages.length, 2);

  const credentials = { username: "test-owner", password: "test-fixture-password" };
  await setAdministrator(f.db, credentials);
  const response = await f.app.request("/api/admin/login", {
    method: "POST", headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const cookie = response.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  const patch = (status: string) => f.app.request(`/api/admin/orders/${order.orderNo}`, {
    method: "PATCH", headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ status }),
  });
  assert.equal((await patch("completed")).status, 200);
  f.advance(1); // 08:00
  await notifications.processDue();
  assert.equal(messages.length, 3);
  assert.ok(messages[2].includes(waiting.orderNo));
  assert.equal((await patch("pending_contact")).status, 200);
  f.advance(7_200_000 - 1);
  await notifications.processDue();
  assert.equal(messages.length, 3);
  f.advance(1);
  await notifications.processDue();
  assert.equal(messages.length, 4);
  assert.ok(messages[3].includes(order.orderNo));
});

test("长时间停机后，未确认过的发送不会越过去重窗口再次提交", async (t) => {
  let timeoutCalls = 0;
  const f = fixture(t, async (input, options) => {
    if (String(input).includes("/gettoken")) return tokenResponse();
    if (notificationContent(options).startsWith("【待联系超时】")) {
      timeoutCalls++;
      throw new Error("发送结果未知");
    }
    return Response.json({ errcode: 0 });
  }, { ...env, ORDER_TIMEOUT_MINUTES: "1" });
  assert.equal((await f.submit()).status, 201);
  await f.notifications.processDue();
  f.advance(60_000);
  await f.notifications.processDue();
  assert.equal(timeoutCalls, 1);
  f.advance(30 * 60_000);
  await f.build().notifications.processDue();
  assert.equal(timeoutCalls, 1);
  assert.equal(f.db.prepare("SELECT failure_code FROM order_timeout_reminders").get()?.failure_code,
    "TIMEOUT_REMINDER_DELIVERY_UNKNOWN");
});

test("重建处理器后按相同内容恢复未确认发送，自定义时段结束即补发", async (t) => {
  const deliveries = new Set<string>();
  let timeoutCalls = 0;
  const f = fixture(t, async (input, options) => {
    if (String(input).includes("/gettoken")) return tokenResponse();
    const content = notificationContent(options);
    if (!content.startsWith("【待联系超时】")) return Response.json({ errcode: 0 });
    const body = JSON.parse(String(options?.body));
    assert.equal(body.enable_duplicate_check, 1);
    assert.equal(body.duplicate_check_interval, 1800);
    deliveries.add(content);
    if (++timeoutCalls === 1) throw new Error("送达后连接中断");
    return Response.json({ errcode: 0 });
  }, { ...env, ORDER_TIMEOUT_MINUTES: "1", ORDER_TIMEOUT_QUIET_START: "13:01", ORDER_TIMEOUT_QUIET_END: "13:03" });
  assert.equal((await f.submit()).status, 201);
  await f.notifications.processDue();
  f.advance(3 * 60_000 - 1);
  await f.notifications.processDue();
  assert.equal(timeoutCalls, 0);
  f.advance(1);
  await f.notifications.processDue();
  assert.equal(timeoutCalls, 1);
  assert.equal(f.db.prepare("SELECT finished_at FROM order_timeout_reminders").get()?.finished_at, null);
  f.advance(30_000);
  const restarted = f.build().notifications;
  await restarted.processDue();
  await restarted.processDue();
  assert.equal(timeoutCalls, 2);
  assert.equal(deliveries.size, 1);
  assert.ok(f.db.prepare("SELECT finished_at FROM order_timeout_reminders").get()?.finished_at);
});
