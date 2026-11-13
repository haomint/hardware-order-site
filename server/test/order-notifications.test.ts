import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { OrderReceiptSchema } from "../../shared/index.ts";
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
  const key = randomUUID();
  const submit = () => app.request("/api/orders", {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      items, contactName: "张三", phone: "13812345678", deliveryMethod: "delivery", address: "测试配送地址",
    }),
  });
  return {
    db, submit, notifications, build,
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
