import type { DatabaseSync } from "node:sqlite";
import type { OrderReceipt } from "../../shared/index.ts";
import { transaction } from "./db.ts";
import { createWecomSender, loadWecomConfig, WecomFailure } from "./wecom.ts";

const retryDelays = [30_000, 120_000, 600_000];

type Job = {
  order_no: string;
  contact_name: string;
  phone: string;
  items_json: string;
  status: string;
  last_attempt_no: number;
};

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
  const due = db.prepare(`
    SELECT o.order_no, o.contact_name, o.phone, o.items_json, o.status,
      coalesce((SELECT max(a.attempt_no) FROM order_notification_attempts a WHERE a.order_no = o.order_no), 0)
        AS last_attempt_no
    FROM order_notifications n JOIN orders o ON n.order_no = o.order_no
    WHERE n.status = 'retrying' AND n.next_attempt_at <= ?
    ORDER BY n.next_attempt_at, n.order_no LIMIT 1
  `);
  const startAttempt = db.prepare(`
    INSERT INTO order_notification_attempts (order_no, attempt_no, started_at) VALUES (?, ?, ?)
  `);
  const recordStart = db.prepare("UPDATE order_notifications SET last_attempt_at = ? WHERE order_no = ?");
  const finishAttempt = db.prepare(`
    UPDATE order_notification_attempts SET finished_at = ?, failure_code = ?
    WHERE order_no = ? AND attempt_no = ? AND finished_at IS NULL
  `);
  const updateStatus = db.prepare(`
    UPDATE order_notifications SET status = ?, next_attempt_at = ?, failure_code = ? WHERE order_no = ?
  `);
  let active: Promise<void> | undefined;

  async function processNext() {
    const job = transaction(db, () => {
      const startedAt = now();
      const next = due.get(startedAt) as Job | undefined;
      if (!next) return undefined;
      if (next.last_attempt_no > 0) {
        // 重启后补记中断的尝试。该次仍占用重试额度。
        finishAttempt.run(startedAt, "WECOM_INTERRUPTED", next.order_no, next.last_attempt_no);
      }
      if (!send || next.last_attempt_no > retryDelays.length) {
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
      await send(message(job));
    } catch (error) {
      failure = error instanceof WecomFailure ? error : new WecomFailure("WECOM_INTERNAL_ERROR", false);
    }
    transaction(db, () => {
      const finishedAt = now();
      const code = failure?.message ?? null;
      const delay = retryDelays[attempt - 1];
      const nextAttempt = failure?.retryable && delay !== undefined ? finishedAt + delay : null;
      finishAttempt.run(finishedAt, code, job.order_no, attempt);
      const status = !failure ? "sent" : nextAttempt === null ? "failed" : "retrying";
      updateStatus.run(status, nextAttempt, code, job.order_no);
    });
  }

  return {
    enqueue(orderNo: string, createdAt: number) {
      insert.run(orderNo, send ? "retrying" : "failed", send ? createdAt : null,
        send ? null : "WECOM_NOT_CONFIGURED");
    },
    processDue() {
      active ??= processNext().finally(() => { active = undefined; });
      return active;
    },
    async drain() {
      await active;
    },
  };
}
