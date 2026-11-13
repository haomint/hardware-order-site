import { z } from "zod";
import { IdSchema } from "./stage-a-schemas.ts";
import { InvalidRequestErrorSchema, apiErrors } from "./stage-a.ts";
import { OrderDetailSchema, OrderPageSchema } from "./stage-b-schemas.ts";
import { stageB, stageBErrors } from "./stage-b.ts";

export const NotificationStatusSchema = z.enum(["sent", "failed", "retrying"])
  .describe("sent 为已发送，failed 为发送失败且当前没有待处理的尝试，retrying 为已排队、发送中或等待重试。");

const notificationStatus = NotificationStatusSchema.nullable()
  .describe(`${NotificationStatusSchema.description} 没有配置可用提醒渠道的新订单为 failed。null 仅用于阶段 C 启用前没有提醒记录的旧订单。`);
const notificationLastAttemptAt = z.iso.datetime().nullable()
  .describe("最近一次实际尝试发送新订单提醒的 UTC 时间，尚未尝试时为 null。");

export const OrderPageWithNotificationSchema = OrderPageSchema.extend({
  items: z.array(OrderPageSchema.shape.items.element.extend({ notificationStatus })),
});
export const OrderDetailWithNotificationSchema = OrderDetailSchema.extend({
  notificationStatus,
  notificationLastAttemptAt,
});

export const NotificationRetryHeadersSchema = z.strictObject({
  "Idempotency-Key": IdSchema.describe("同一次手动重发及其网络重试使用同一个 UUID v4。"),
});

export const notificationRetryTiming = {
  channelTimeoutSeconds: 10,
  maxProcessingSeconds: 30,
  pollIntervalSeconds: 3,
  maxPollingSeconds: 45,
} as const;

export const stageCErrors = {
  INVALID_REQUEST: apiErrors.INVALID_REQUEST,
  INVALID_ORIGIN: apiErrors.INVALID_ORIGIN,
  UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
  INTERNAL_ERROR: apiErrors.INTERNAL_ERROR,
  ORDER_NOT_FOUND: stageBErrors.ORDER_NOT_FOUND,
  ORDER_STATUS_CONFLICT: stageBErrors.ORDER_STATUS_CONFLICT,
  NOTIFICATION_NOT_RETRYABLE: { status: 409, message: "只有发送失败且未在处理中的提醒可以重发，请刷新订单查看。" },
} as const;

const simpleErrorCodes = (Object.keys(stageCErrors) as (keyof typeof stageCErrors)[])
  .filter((code) => code !== "INVALID_REQUEST");

export const StageCApiErrorSchema = z.discriminatedUnion("code", [
  InvalidRequestErrorSchema,
  z.strictObject({ code: z.enum(simpleErrorCodes), message: z.string().min(1) }),
]);

export const stageCInfo = {
  title: "五金订货网站 · 阶段 C 提醒接口契约草案",
  version: "0.1.0-draft.2",
  description: [
    "沿用阶段 B 的后台订单路径。阶段 C 启用后，订单列表增加 notificationStatus，详情及修改订单的响应同时增加 notificationLastAttemptAt。响应中的其余订单字段与阶段 B 一致。",
    "提醒状态只描述新订单提醒，涵盖自动重试、备用渠道和手动重发。任一渠道成功后为 sent。超时未处理的再次提醒单独记录，不改变这里的状态和尝试时间。",
    "按 PRD 修订 3，主渠道为企业微信自建应用的应用消息，管理员可通过企业的微信插件在普通微信接收。若店主确认备用渠道作为主渠道，按该配置发送。",
    `${notificationStatus.description} ${notificationLastAttemptAt.description} 通知变化不改动订单的 updatedAt、订单状态或收款标记。`,
    "后台接口沿用 HttpOnly Cookie、成功请求滑动续期、写操作 Origin 校验及禁用缓存。开发环境跨域直连时，允许的来源可在 CORS 预检中使用 Idempotency-Key。",
  ].join("\n\n"),
};

export const stageC = {
  listAdminOrders: {
    ...stageB.listAdminOrders,
    description: `${stageB.listAdminOrders.description} notificationStatus 为 failed 时可在列表标记提醒发送失败。`,
    success: { ...stageB.listAdminOrders.success, schema: OrderPageWithNotificationSchema },
  },
  getAdminOrder: {
    ...stageB.getAdminOrder,
    description: `${stageB.getAdminOrder.description} 同时返回新订单提醒状态和最后一次尝试时间。`,
    success: { ...stageB.getAdminOrder.success, schema: OrderDetailWithNotificationSchema },
  },
  updateAdminOrder: {
    ...stageB.updateAdminOrder,
    success: { ...stageB.updateAdminOrder.success, schema: OrderDetailWithNotificationSchema },
  },
  retryAdminNotification: {
    method: "post", path: "/api/admin/orders/{orderNo}/notifications/retry", tag: "后台订单提醒", admin: true,
    summary: "手动重发新订单提醒",
    description: [
      "请求无正文。只有当前状态为 failed 的新订单提醒可重发。服务端须在同一事务中保存重发受理记录并将提醒置为 retrying。首次受理返回 202 和完整订单详情，notificationStatus 为 retrying。",
      "同一订单与同一 Idempotency-Key 已受理时，返回 202 和当前订单详情，不再次排队。此检查先于当前状态判断，因此发送结束后的网络重试也能得到当前详情。未受理的请求不占用键。",
      "不同键并发提交时只有一个请求能从 failed 进入 retrying，其余返回 409 NOTIFICATION_NOT_RETRYABLE。无提醒记录、已发送或处理中也返回该错误。订单不存在时返回 404，无法保存受理记录时返回 500。",
      `受理后立即安排一轮发送，主渠道尝试一次。主渠道失败或不可用时，若已配置备用渠道，再尝试一次备用渠道。每个渠道的整次尝试最多 ${notificationRetryTiming.channelTimeoutSeconds} 秒，包含获取或刷新企业微信访问令牌。手动重发不走自动退避，整轮从受理起最多 ${notificationRetryTiming.maxProcessingSeconds} 秒，含排队和结果入库。成功记为 sent，全部失败、没有可用配置或达到截止时间则记为 failed。`,
      `前端用 202 中的详情立即更新页面。若状态为 retrying，禁用重发按钮，每 ${notificationRetryTiming.pollIntervalSeconds} 秒查一次详情，遇到 sent 或 failed 即停止，最多轮询 ${notificationRetryTiming.maxPollingSeconds} 秒。到时仍在处理中提示「还在发送，稍后刷新看看」。一次点击生成一个键，网络重试沿用该键。上一轮结束后再次失败时，新一轮重发使用新键。`,
    ].join(" "),
    params: stageB.getAdminOrder.params,
    headers: NotificationRetryHeadersSchema,
    success: {
      status: 202, schema: OrderDetailWithNotificationSchema, description: "已受理重发，返回完整订单详情。首次返回处理中，幂等重放返回当前状态。",
    },
    errors: ["ORDER_NOT_FOUND", "NOTIFICATION_NOT_RETRYABLE"],
  },
} as const;

export type NotificationStatus = z.output<typeof NotificationStatusSchema>;
export type OrderPageWithNotification = z.output<typeof OrderPageWithNotificationSchema>;
export type OrderDetailWithNotification = z.output<typeof OrderDetailWithNotificationSchema>;
