import type { DatabaseSync } from "node:sqlite";
import { notificationRetryTiming, type OrderReceipt } from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { ApiFailure, OrderFailure } from "./errors.ts";
import { createWecomSender, loadWecomConfig, WecomFailure } from "./wecom.ts";

const retryDelays = [30_000, 120_000, 600_000];

type Job = {
  order_no: string;
  contact_name: string;
  phone: string;
  items_json: string;
  status: string;
  last_attempt_no: number;
  manual_deadline_at: number | null;
};

const manualTimeout = notificationRetryTiming.maxProcessingSeconds * 1000;
const channelTimeout = notificationRetryTiming.channelTimeoutSeconds * 1000;

function message(job: Job) {
  const items = JSON.parse(job.items_json) as OrderReceipt["items"];
  const names = items.slice(0, 3).map(({ name, quantity }) =>
    `${name.replace(/[\r\n]+/g, " ")} ×${quantity}`).join("、");
  const summary = items.length > 3 ? `${names} 等 ${items.length} 类` : `${names}（共 ${items.length} 类）`;
  const surname = job.contact_name.match(/^\p{Script=Han}/u)?.[0];
  const statusLabels = {
    pending_contact: "待联系", pending_payment: "待收款", pending_fulfillment: "待履约",
    completed: "已完成", cancelled: "已取消",
  };
  const status = statusLabels[job.status as keyof typeof statusLabels];
  return [
    `【新订货单】#${job.order_no}`,
    `客户：${surname ? surname + "师傅" : "客户"}｜尾号：${job.phone.slice(-4)}`,
    `商品：${summary}`,
    `状态：${status}`,
    "请登录后台查看完整电话和配送地址。",
  ].join("\n");
}

export function createOrderNotifications(
  db: DatabaseSync, config: ReturnType<typeof loadWecomConfig>, now: () => number, request?: typeof fetch,
) {
  const send = config && createWecomSender(config, now, request);
  const insert = db.prepare(`
    INSERT INTO order_notifications (order_no, status, next_attempt_at, failure_code)
    VALUES (?, ?, ?, ?)
  `);
  const selectJob = `
    SELECT o.order_no, o.contact_name, o.phone, o.items_json, o.status, n.manual_deadline_at,
      coalesce((SELECT max(a.attempt_no) FROM order_notification_attempts a WHERE a.order_no = o.order_no), 0)
        AS last_attempt_no
    FROM order_notifications n JOIN orders o ON n.order_no = o.order_no
  `;
  const due = db.prepare(`
    ${selectJob}
    WHERE n.status = 'retrying' AND n.next_attempt_at <= ?
    ORDER BY n.next_attempt_at, n.order_no LIMIT 1
  `);
  const dueManual = db.prepare(`
    ${selectJob}
    WHERE n.manual_deadline_at IS NOT NULL AND n.next_attempt_at <= ?
    ORDER BY n.manual_deadline_at LIMIT 1
  `);
  const startAttempt = db.prepare(`
    INSERT INTO order_notification_attempts (order_no, attempt_no, started_at) VALUES (?, ?, ?)
  `);
  const recordStart = db.prepare(`
    UPDATE order_notifications
    -- 手动重发开始后移出队列。进程中断时等截止时间记失败，避免重复发送。
    SET last_attempt_at = ?, next_attempt_at = CASE WHEN manual_deadline_at IS NULL THEN next_attempt_at END
    WHERE order_no = ?
  `);
  const finishAttempt = db.prepare(`
    UPDATE order_notification_attempts SET finished_at = ?, failure_code = ?
    WHERE order_no = ? AND attempt_no = ? AND finished_at IS NULL
  `);
  const updateStatus = db.prepare(`
    UPDATE order_notifications
    SET status = ?, next_attempt_at = ?, failure_code = ?, manual_deadline_at = NULL WHERE order_no = ?
  `);
  const existingKey = db.prepare(`
    SELECT 1 FROM order_notification_retry_keys WHERE order_no = ? AND idempotency_key = ?
  `);
  const queueManual = db.prepare(`
    UPDATE order_notifications
    SET status = 'retrying', next_attempt_at = ?, manual_deadline_at = ?, failure_code = NULL
    WHERE order_no = ? AND status = 'failed'
  `);
  const saveKey = db.prepare("INSERT INTO order_notification_retry_keys VALUES (?, ?)");
  const existingOrder = db.prepare("SELECT 1 FROM orders WHERE order_no = ?");
  const expired = db.prepare("SELECT 1 FROM order_notifications WHERE manual_deadline_at <= ? LIMIT 1");
  const expireAttempts = db.prepare(`
    UPDATE order_notification_attempts SET finished_at = ?, failure_code = 'NOTIFICATION_DEADLINE_EXCEEDED'
    WHERE finished_at IS NULL AND order_no IN (
      SELECT order_no FROM order_notifications WHERE manual_deadline_at <= ?
    )
  `);
  const expireJobs = db.prepare(`
    UPDATE order_notifications SET status = 'failed', next_attempt_at = NULL,
      failure_code = 'NOTIFICATION_DEADLINE_EXCEEDED', manual_deadline_at = NULL
    WHERE manual_deadline_at <= ?
  `);
  let active: Promise<void> | undefined;

  function expireManual() {
    const timestamp = now();
    if (!expired.get(timestamp)) return;
    transaction(db, () => {
      expireAttempts.run(timestamp, timestamp);
      expireJobs.run(timestamp);
    });
  }

  async function processNext() {
    const job = transaction(db, () => {
      const startedAt = now();
      const next = (dueManual.get(startedAt) ?? due.get(startedAt)) as Job | undefined;
      if (!next) return undefined;
      if (next.last_attempt_no > 0) {
        // 重启后补记中断的尝试。该次仍占用重试额度。
        finishAttempt.run(startedAt, "WECOM_INTERRUPTED", next.order_no, next.last_attempt_no);
      }
      if (!send || (next.manual_deadline_at === null && next.last_attempt_no > retryDelays.length)) {
        updateStatus.run("failed", null, send ? "WECOM_INTERRUPTED" : "WECOM_NOT_CONFIGURED", next.order_no);
        return undefined;
      }
      startAttempt.run(next.order_no, next.last_attempt_no + 1, startedAt);
      recordStart.run(startedAt, next.order_no);
      return next;
    });
    if (!job || !send) return;

    const attempt = job.last_attempt_no + 1;
    let failure: WecomFailure | undefined;
    try {
      const remaining = job.manual_deadline_at === null ? channelTimeout : job.manual_deadline_at - now();
      if (remaining <= 0) throw new WecomFailure("NOTIFICATION_DEADLINE_EXCEEDED", false);
      await send(message(job), AbortSignal.timeout(Math.min(channelTimeout, remaining)));
    } catch (error) {
      failure = error instanceof WecomFailure ? error : new WecomFailure("WECOM_INTERNAL_ERROR", false);
    }
    transaction(db, () => {
      const finishedAt = now();
      if (job.manual_deadline_at !== null && finishedAt >= job.manual_deadline_at) {
        failure = new WecomFailure("NOTIFICATION_DEADLINE_EXCEEDED", false);
      }
      const code = failure?.message ?? null;
      const delay = job.manual_deadline_at === null ? retryDelays[attempt - 1] : undefined;
      const nextAttempt = failure?.retryable && delay !== undefined ? finishedAt + delay : null;
      // 可能已达到截止时间，旧请求返回时不得覆盖新一轮重发。
      if (!finishAttempt.run(finishedAt, code, job.order_no, attempt).changes) return;
      const status = !failure ? "sent" : nextAttempt === null ? "failed" : "retrying";
      updateStatus.run(status, nextAttempt, code, job.order_no);
    });
  }

  return {
    expireManual,
    retry(orderNo: string, key: string) {
      const idempotencyKey = key.toLowerCase();
      transaction(db, () => {
        if (existingKey.get(orderNo, idempotencyKey)) return;
        const acceptedAt = now();
        if (!queueManual.run(acceptedAt, acceptedAt + manualTimeout, orderNo).changes) {
          if (!existingOrder.get(orderNo)) throw new OrderFailure("ORDER_NOT_FOUND");
          throw new ApiFailure("NOTIFICATION_NOT_RETRYABLE");
        }
        saveKey.run(orderNo, idempotencyKey);
      });
    },
    enqueue(orderNo: string, createdAt: number) {
      insert.run(orderNo, send ? "retrying" : "failed", send ? createdAt : null,
        send ? null : "WECOM_NOT_CONFIGURED");
    },
    async processDue() {
      expireManual();
      active ??= processNext().finally(() => { active = undefined; });
      return active;
    },
    async drain() {
      await active;
    },
  };
}
