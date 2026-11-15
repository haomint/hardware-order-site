import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./db.ts";
import { createWecomSender, WecomFailure, wecomDuplicateWindowSeconds } from "./wecom.ts";

const minute = 60_000;
const dayMinutes = 24 * 60;
const recoveryWindow = (wecomDuplicateWindowSeconds - 60) * 1000;
const retryAfter = 30_000;

function timeOfDay(value: string, name: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${name} 必须使用 HH:mm 格式。`);
  const [hour, minutes] = value.split(":").map(Number);
  return hour * 60 + minutes;
}

export function loadOrderTimeoutConfig(env: NodeJS.ProcessEnv) {
  const rawMinutes = env.ORDER_TIMEOUT_MINUTES ?? "120";
  const delay = Number(rawMinutes);
  if (!/^\d+$/.test(rawMinutes) || !Number.isSafeInteger(delay * minute) || delay < 1) {
    throw new Error("ORDER_TIMEOUT_MINUTES 必须是正整数。");
  }
  const quietStart = timeOfDay(env.ORDER_TIMEOUT_QUIET_START ?? "21:00", "ORDER_TIMEOUT_QUIET_START");
  const quietEnd = timeOfDay(env.ORDER_TIMEOUT_QUIET_END ?? "08:00", "ORDER_TIMEOUT_QUIET_END");
  return { delay: delay * minute, quietStart, quietEnd };
}

export function createOrderTimeoutReminders(
  db: DatabaseSync,
  config: ReturnType<typeof loadOrderTimeoutConfig>,
  now: () => number,
  send: ReturnType<typeof createWecomSender>,
) {
  function isQuiet(timestamp: number) {
    const local = (Math.floor(timestamp / minute) + 8 * 60) % dayMinutes;
    const { quietStart, quietEnd } = config;
    return quietStart <= quietEnd
      ? local >= quietStart && local < quietEnd
      : local >= quietStart || local < quietEnd;
  }

  const pending = db.prepare(`
    SELECT o.order_no
    FROM orders o LEFT JOIN order_timeout_reminders r USING (order_no)
    WHERE o.status = 'pending_contact' AND coalesce(o.status_updated_at, o.created_at) <= ?
      AND (r.order_no IS NULL OR r.next_attempt_at <= ?)
    ORDER BY coalesce(o.status_updated_at, o.created_at), o.order_no LIMIT 1
  `);
  const reserve = db.prepare(`
    INSERT INTO order_timeout_reminders (order_no, next_attempt_at) VALUES (?, ?)
    ON CONFLICT (order_no) DO UPDATE SET next_attempt_at = excluded.next_attempt_at
  `);
  const finish = db.prepare(`
    UPDATE order_timeout_reminders SET finished_at = ?, next_attempt_at = NULL, failure_code = ?
    WHERE order_no = ?
  `);
  const expire = db.prepare(`
    UPDATE order_timeout_reminders SET finished_at = ?, next_attempt_at = NULL,
      failure_code = 'TIMEOUT_REMINDER_DELIVERY_UNKNOWN'
    WHERE next_attempt_at IS NOT NULL AND first_dispatch_at <= ?
  `);
  const verifyPending = db.prepare(`
    SELECT 1 FROM orders WHERE order_no = ? AND status = 'pending_contact'
      AND coalesce(status_updated_at, created_at) <= ?
  `);
  const startDispatch = db.prepare(`
    UPDATE order_timeout_reminders SET first_dispatch_at = coalesce(first_dispatch_at, ?)
    WHERE order_no = ? AND (first_dispatch_at IS NULL OR first_dispatch_at > ?)
  `);

  // 失败后保留同一条消息用于恢复，企业微信按相同内容去重。
  return async function processTimeoutReminder() {
    const orderNo = transaction(db, () => {
      const startedAt = now();
      expire.run(startedAt, startedAt - recoveryWindow);
      if (isQuiet(startedAt)) return undefined;
      const row = pending.get(startedAt - config.delay, startedAt) as { order_no: string } | undefined;
      if (row) reserve.run(row.order_no, startedAt + retryAfter);
      return row?.order_no;
    });
    if (!orderNo) return;

    let deferred = false;
    try {
      await send(`【待联系超时】订货单 #${orderNo}\n请登录后台查看订单并联系客户。`, undefined, () => {
        const dispatchAt = now();
        if (isQuiet(dispatchAt) || !verifyPending.get(orderNo, dispatchAt - config.delay)) {
          deferred = true;
          throw new WecomFailure("TIMEOUT_REMINDER_DEFERRED", false);
        }
        if (!startDispatch.run(dispatchAt, orderNo, dispatchAt - recoveryWindow).changes) {
          throw new WecomFailure("TIMEOUT_REMINDER_DELIVERY_UNKNOWN", false);
        }
      });
      finish.run(now(), null, orderNo);
    } catch (error) {
      if (deferred) return;
      const failure = error instanceof WecomFailure ? error : new WecomFailure("WECOM_INTERNAL_ERROR", false);
      if (!failure.retryable) finish.run(now(), failure.message, orderNo);
    }
  };
}
