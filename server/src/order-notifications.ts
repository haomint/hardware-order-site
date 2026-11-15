import type { DatabaseSync } from "node:sqlite";
import { notificationRetryTiming, type OrderReceipt } from "../../shared/index.ts";
import type { Config } from "./config.ts";
import { transaction } from "./db.ts";
import { ApiFailure, OrderFailure } from "./errors.ts";
import { createNotificationEmailSender, NotificationEmailFailure, type SendNotificationMail } from "./notification-email.ts";
import { createOrderTimeoutReminders } from "./order-timeout-reminders.ts";
import { createWecomSender, WecomFailure } from "./wecom.ts";

const retryDelays = [30_000, 120_000, 600_000];

type Channel = "wecom" | "email";
type Job = {
  order_no: string;
  contact_name: string;
  phone: string;
  items_json: string;
  status: string;
  last_attempt_no: number;
  manual_deadline_at: number | null;
  next_channel: Channel;
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
  db: DatabaseSync, config: Pick<Config, "wecom" | "notificationEmail" | "orderTimeout">,
  now: () => number, request?: typeof fetch, sendMail?: SendNotificationMail,
) {
  const sendWecom = config.wecom && createWecomSender(config.wecom, now, request);
  const sendEmail = config.notificationEmail && createNotificationEmailSender(config.notificationEmail, sendMail);
  const available = sendWecom || sendEmail;
  const firstChannel: Channel = sendWecom || !sendEmail ? "wecom" : "email";
  const processTimeoutReminder = sendWecom && createOrderTimeoutReminders(db, config.orderTimeout, now, sendWecom);
  const insert = db.prepare(`
    INSERT INTO order_notifications (order_no, status, next_attempt_at, failure_code, next_channel)
    VALUES (?, ?, ?, ?, ?)
  `);
  const selectJob = `
    SELECT o.order_no, o.contact_name, o.phone, o.items_json, o.status, n.manual_deadline_at, n.next_channel,
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
  const dueFallback = db.prepare(`
    ${selectJob}
    WHERE n.order_no = ? AND n.status = 'retrying' AND n.next_channel = 'email' AND n.next_attempt_at <= ?
  `);
  const startAttempt = db.prepare(`
    INSERT INTO order_notification_attempts (order_no, attempt_no, started_at, channel) VALUES (?, ?, ?, ?)
  `);
  const recordStart = db.prepare(`
    UPDATE order_notifications
    -- 手动重发开始后移出队列。进程中断时等截止时间记失败，避免重复发送。
    SET last_attempt_at = ?, next_channel = ?,
      next_attempt_at = CASE WHEN manual_deadline_at IS NULL THEN next_attempt_at END
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
  const queueEmail = db.prepare(`
    UPDATE order_notifications SET next_channel = 'email', next_attempt_at = ?, failure_code = ?
    WHERE order_no = ?
  `);
  const existingKey = db.prepare(`
    SELECT 1 FROM order_notification_retry_keys WHERE order_no = ? AND idempotency_key = ?
  `);
  const queueManual = db.prepare(`
    UPDATE order_notifications
    SET status = 'retrying', next_attempt_at = ?, manual_deadline_at = ?, failure_code = NULL, next_channel = ?
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

  async function processAttempt(fallbackOrderNo?: string): Promise<string | undefined> {
    const job = transaction(db, () => {
      const startedAt = now();
      const next = (fallbackOrderNo
        ? dueFallback.get(fallbackOrderNo, startedAt)
        : dueManual.get(startedAt) ?? due.get(startedAt)) as Job | undefined;
      if (!next) return undefined;
      const { order_no, manual_deadline_at, last_attempt_no } = next;
      if (manual_deadline_at !== null && startedAt >= manual_deadline_at) {
        updateStatus.run("failed", null, "NOTIFICATION_DEADLINE_EXCEEDED", order_no);
        return undefined;
      }
      const interrupted = next.next_channel === "email" ? "EMAIL_INTERRUPTED" : "WECOM_INTERRUPTED";
      const recovered = last_attempt_no > 0 && finishAttempt.run(startedAt, interrupted, order_no, last_attempt_no).changes;
      let channel = next.next_channel;
      if (channel === "wecom" && (!sendWecom || (manual_deadline_at === null && last_attempt_no > retryDelays.length))) {
        if (!sendEmail) {
          updateStatus.run("failed", null, sendWecom ? interrupted : "WECOM_NOT_CONFIGURED", order_no);
          return undefined;
        }
        channel = "email";
      } else if (channel === "email" && (!sendEmail || recovered)) {
        // 重启时无法确定 SMTP 是否已接收已开始的邮件，保留失败记录等待管理员决定。
        updateStatus.run("failed", null, recovered ? interrupted : "EMAIL_NOT_CONFIGURED", order_no);
        return undefined;
      }
      startAttempt.run(order_no, last_attempt_no + 1, startedAt, channel);
      recordStart.run(startedAt, channel, order_no);
      return { ...next, channel };
    });
    if (!job) return;

    const attempt = job.last_attempt_no + 1;
    let failure: Error | undefined;
    try {
      const remaining = job.manual_deadline_at === null ? channelTimeout : job.manual_deadline_at - now();
      if (remaining <= 0) throw new WecomFailure("NOTIFICATION_DEADLINE_EXCEEDED", false);
      const signal = AbortSignal.timeout(Math.min(channelTimeout, remaining));
      const text = message(job);
      if (job.channel === "wecom") await sendWecom!(text, signal);
      else await sendEmail!(job.order_no, text, signal);
    } catch (error) {
      failure = error instanceof WecomFailure || error instanceof NotificationEmailFailure
        ? error
        : new Error(job.channel === "wecom" ? "WECOM_INTERNAL_ERROR" : "EMAIL_INTERNAL_ERROR");
    }
    return transaction(db, () => {
      const finishedAt = now();
      if (job.manual_deadline_at !== null && finishedAt >= job.manual_deadline_at) {
        failure = new WecomFailure("NOTIFICATION_DEADLINE_EXCEEDED", false);
      }
      const code = failure?.message ?? null;
      const delay = job.channel === "wecom" && job.manual_deadline_at === null ? retryDelays[attempt - 1] : undefined;
      const nextAttempt = failure instanceof WecomFailure && failure.retryable && delay !== undefined
        ? finishedAt + delay : null;
      // 可能已达到截止时间，旧请求返回时不得覆盖新一轮重发。
      if (!finishAttempt.run(finishedAt, code, job.order_no, attempt).changes) return;
      if (failure && job.channel === "wecom" && sendEmail && nextAttempt === null && code !== "NOTIFICATION_DEADLINE_EXCEEDED") {
        queueEmail.run(finishedAt, code, job.order_no);
        return job.order_no;
      }
      const status = !failure ? "sent" : nextAttempt === null ? "failed" : "retrying";
      updateStatus.run(status, nextAttempt, code, job.order_no);
    });
  }

  async function processNotifications() {
    const fallback = await processAttempt();
    if (fallback) await processAttempt(fallback);
    await processTimeoutReminder?.();
  }

  return {
    expireManual,
    retry(orderNo: string, key: string) {
      const idempotencyKey = key.toLowerCase();
      transaction(db, () => {
        if (existingKey.get(orderNo, idempotencyKey)) return;
        const acceptedAt = now();
        if (!queueManual.run(acceptedAt, acceptedAt + manualTimeout, firstChannel, orderNo).changes) {
          if (!existingOrder.get(orderNo)) throw new OrderFailure("ORDER_NOT_FOUND");
          throw new ApiFailure("NOTIFICATION_NOT_RETRYABLE");
        }
        saveKey.run(orderNo, idempotencyKey);
      });
    },
    enqueue(orderNo: string, createdAt: number) {
      insert.run(orderNo, available ? "retrying" : "failed", available ? createdAt : null,
        available ? null : "WECOM_NOT_CONFIGURED", firstChannel);
    },
    async processDue() {
      expireManual();
      active ??= processNotifications().finally(() => { active = undefined; });
      return active;
    },
    async drain() {
      await active;
    },
  };
}
