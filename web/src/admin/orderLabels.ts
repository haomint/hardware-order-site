import type { OrderStatus, PaymentStatus } from "../api/index.ts";

/** 订单状态的中文名和标签配色。 */
export const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending_contact: { label: "待联系", className: "bg-accent/10 text-accent-dark" },
  pending_payment: { label: "待收款", className: "bg-amber-50 text-amber-800" },
  pending_fulfillment: { label: "待履约", className: "bg-brand-soft text-brand" },
  completed: { label: "已完成", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "已取消", className: "bg-page text-muted" },
};

export const STATUS_ORDER: OrderStatus[] = ["pending_contact", "pending_payment", "pending_fulfillment", "completed", "cancelled"];

export const PAYMENT: Record<PaymentStatus, string> = { unpaid: "未收款", paid: "已收款" };

export const DELIVERY: Record<"delivery" | "pickup", string> = { delivery: "送货上门", pickup: "到店自提" };

const beijing = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 北京时间 2026-11-13 15:31；今天和昨天显示为「今天 15:31」「昨天 15:31」。 */
export function formatTime(iso: string | null, relative = false): string {
  if (!iso) return "";
  const parts = Object.fromEntries(beijing.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  if (relative) {
    const today = Object.fromEntries(beijing.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const yesterday = Object.fromEntries(beijing.formatToParts(new Date(Date.now() - 864e5)).map((p) => [p.type, p.value]));
    if (date === `${today.year}-${today.month}-${today.day}`) return `今天 ${time}`;
    if (date === `${yesterday.year}-${yesterday.month}-${yesterday.day}`) return `昨天 ${time}`;
    if (parts.year === today.year) return `${parts.month}-${parts.day} ${time}`;
  }
  return `${date} ${time}`;
}

