// 订单详情里的「手机提醒」：新订单提醒有没有发到店主微信，失败时可以重发（阶段 C 契约 #47）。
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/index.ts";
import type { NotificationStatus, OrderDetail, notificationRetryTiming } from "../api/index.ts";
import { uuidv4 } from "../lib/contact.ts";
import { toast } from "../components/Feedback.tsx";
import { Button } from "./ui.tsx";
import { formatTime } from "./orderLabels.ts";

/** 与契约 notificationRetryTiming 一致；契约改了数字，这里会类型报错。 */
const TIMING: typeof notificationRetryTiming = {
  channelTimeoutSeconds: 10,
  maxProcessingSeconds: 30,
  pollIntervalSeconds: 3,
  maxPollingSeconds: 45,
};

/** 后端还没升级到阶段 C 时没有这个字段，按「无提醒记录」处理。 */
export function notificationOf(order: { notificationStatus?: NotificationStatus | null }): NotificationStatus | null {
  return order.notificationStatus ?? null;
}

type NotificationFields = Pick<OrderDetail, "notificationStatus" | "notificationLastAttemptAt">;

export function OrderNotification({ order, onChange }: { order: OrderDetail; onChange: (fields: NotificationFields) => void }) {
  const status = notificationOf(order);
  const [sending, setSending] = useState(false);
  const [stillSending, setStillSending] = useState(false);
  // 一次点击一个键；只有请求没有到达后台（网络错误）时，再点沿用同一个键。
  const pendingKey = useRef<string | null>(null);

  // 处理中时每 3 秒查一次，拿到结果就停，最多查 45 秒。
  useEffect(() => {
    if (status !== "retrying") return;
    setStillSending(false);
    let stopped = false;
    const started = Date.now();
    let timer = 0;
    const poll = async () => {
      if (stopped) return;
      if (Date.now() - started >= TIMING.maxPollingSeconds * 1000) {
        setStillSending(true);
        return;
      }
      try {
        const latest = await api.getAdminOrder(order.orderNo);
        if (stopped) return;
        if (notificationOf(latest) !== "retrying") {
          onChange({ notificationStatus: latest.notificationStatus, notificationLastAttemptAt: latest.notificationLastAttemptAt });
          return;
        }
      } catch {
        // 偶尔查询失败不打扰店主，下一轮再查。
      }
      timer = window.setTimeout(poll, TIMING.pollIntervalSeconds * 1000);
    };
    timer = window.setTimeout(poll, TIMING.pollIntervalSeconds * 1000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, order.orderNo]);

  if (status === null) return null;

  const retry = async () => {
    if (sending) return;
    setSending(true);
    const key = pendingKey.current ?? uuidv4();
    pendingKey.current = key;
    try {
      const updated = await api.retryAdminNotification(order.orderNo, key);
      pendingKey.current = null;
      onChange({ notificationStatus: updated.notificationStatus, notificationLastAttemptAt: updated.notificationLastAttemptAt });
    } catch (error) {
      if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
        toast(error.message);
        return;
      }
      pendingKey.current = null;
      toast(error instanceof ApiError ? error.message : "重发失败，请稍后再试。");
      // 状态可能已经变了（例如别处已重发），刷新一下。
      try {
        const latest = await api.getAdminOrder(order.orderNo);
        onChange({ notificationStatus: latest.notificationStatus, notificationLastAttemptAt: latest.notificationLastAttemptAt });
      } catch {
        // 刷新失败就保持原样。
      }
    } finally {
      setSending(false);
    }
  };

  const time = order.notificationLastAttemptAt ? formatTime(order.notificationLastAttemptAt, true) : "";

  if (status === "sent") {
    return (
      <section className="flex items-center gap-2 rounded-card bg-surface px-4 py-3 shadow-card" aria-label="手机提醒">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        <p className="min-w-0 flex-1 text-[15px] text-ink">
          手机提醒：<span className="font-medium text-emerald-700">已发送</span>
        </p>
        {time && <span className="shrink-0 text-[13px] text-muted">{time}</span>}
      </section>
    );
  }

  if (status === "retrying") {
    return (
      <section className="rounded-card bg-surface px-4 py-3 shadow-card" aria-label="手机提醒" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
          <p className="min-w-0 flex-1 text-[15px] text-ink">
            手机提醒：<span className="font-medium text-brand">正在发送…</span>
          </p>
        </div>
        {stillSending && <p className="mt-1.5 text-[13px] text-muted">还在发送，稍后刷新看看。</p>}
      </section>
    );
  }

  return (
    <section className="rounded-card border border-red-200 bg-red-50 px-4 py-3" aria-label="手机提醒" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-red-800">手机提醒：发送失败</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-red-900/80">
            这笔订单的提醒没有发到微信。订单本身已经保存好，不受影响。
            {time && <span className="block">最后一次尝试 {time}</span>}
          </p>
        </div>
        <Button variant="danger" className="shrink-0" disabled={sending} onClick={retry}>
          {sending ? "正在重发…" : "重发提醒"}
        </Button>
      </div>
    </section>
  );
}
