import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { OrderDetail, OrderStatus, UpdateOrder } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { formatYuan } from "../lib/format.ts";
import { copyText } from "../lib/clipboard.ts";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { BackIcon, CopyIcon, PhoneIcon } from "../components/icons.tsx";
import { Button, ConfirmDialog, TextArea, TextInput } from "./ui.tsx";
import { DELIVERY, formatTime, PAYMENT, STATUS, STATUS_ORDER } from "./orderLabels.ts";

/** 「12」「12.5」「12.50」转成分；格式不对返回 null。 */
function yuanToCents(text: string): number | null {
  const value = text.trim().replace(/[,，¥￥]/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
const centsText = (cents: number | null) => (cents === null ? "" : formatYuan(cents).replace(/,/g, ""));

function messageOf(error: unknown) {
  if (error instanceof ApiError) return Object.values(error.fieldErrors ?? {})[0] ?? error.message;
  return "保存失败，请重试。";
}

export function OrderEdit() {
  const { orderNo = "" } = useParams();
  const navigate = useNavigate();
  const { state, retry } = useAsync(() => api.getAdminOrder(orderNo), [orderNo]);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  useEffect(() => {
    if (state.status === "ready") setOrder(state.data);
  }, [state]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/admin/orders"));

  if (state.status === "error") {
    const notFound = state.error instanceof ApiError && state.error.code === "ORDER_NOT_FOUND";
    return notFound ? (
      <div className="py-10 text-center">
        <p className="text-base text-ink">找不到这笔订单。</p>
        <Link to="/admin/orders" className="mt-4 inline-flex min-h-tap items-center text-base text-brand">
          返回订单列表
        </Link>
      </div>
    ) : (
      <ErrorNotice message={state.error.message} onRetry={retry} />
    );
  }
  if (!order) return <p className="py-10 text-center text-muted">正在加载…</p>;

  return <Editor order={order} onChange={setOrder} onBack={goBack} />;
}

function Editor({ order, onChange, onBack }: { order: OrderDetail; onChange: (o: OrderDetail) => void; onBack: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState(order.cancellationReason ?? "");
  const [reasonError, setReasonError] = useState("");
  const [finalText, setFinalText] = useState(centsText(order.finalTotalCents));
  const [finalError, setFinalError] = useState("");
  const [note, setNote] = useState(order.adminNote);
  const [editingReason, setEditingReason] = useState(false);

  useEffect(() => {
    document.title = `订单 ${order.orderNo} - 店铺后台`;
  }, [order.orderNo]);

  const save = async (key: string, patch: UpdateOrder, done: string) => {
    setSaving(key);
    try {
      const updated = await api.updateAdminOrder(order.orderNo, patch);
      onChange(updated);
      toast(done);
      return true;
    } catch (error) {
      toast(messageOf(error));
      return false;
    } finally {
      setSaving(null);
    }
  };

  const pickStatus = (status: OrderStatus) => {
    if (status === order.status || saving) return;
    if (status === "completed" || status === "cancelled") {
      setReason(order.cancellationReason ?? "");
      setReasonError("");
      setConfirm(status);
      return;
    }
    void save("status", { status }, `已改为「${STATUS[status].label}」`);
  };

  const confirmStatus = async () => {
    if (confirm === "cancelled") {
      if (!reason.trim()) {
        setReasonError("请填写取消原因。");
        return;
      }
      if (await save("status", { status: "cancelled", cancellationReason: reason.trim() }, "订单已取消")) setConfirm(null);
      return;
    }
    if (confirm && (await save("status", { status: confirm }, `已改为「${STATUS[confirm].label}」`))) setConfirm(null);
  };

  const saveFinal = async (clear = false) => {
    if (clear) {
      if (await save("final", { finalTotalCents: null }, "已清除最终确认金额")) setFinalText("");
      return;
    }
    const cents = yuanToCents(finalText);
    if (cents === null) {
      setFinalError(finalText.trim() ? "金额格式不对，例如 1280 或 1280.50。" : "请填写金额。");
      return;
    }
    setFinalError("");
    if (await save("final", { finalTotalCents: cents }, "已保存最终确认金额")) setFinalText(centsText(cents));
  };

  const unpaidDone = order.status === "completed" && order.paymentStatus === "unpaid";
  const hasNegotiable = order.items.some((item) => item.unitPriceCents === null);

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onBack} className="-ml-2 flex min-h-tap items-center gap-0.5 px-2 text-base text-ink">
          <BackIcon />
          订单列表
        </button>
      </div>

      {/* 订单号与当前状态 */}
      <section className="rounded-card bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular text-[19px] font-bold text-ink">{order.orderNo}</p>
            <p className="mt-0.5 text-[13px] text-muted">下单时间 {formatTime(order.createdAt)}</p>
          </div>
          <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[15px] font-bold ${STATUS[order.status].className}`}>{STATUS[order.status].label}</span>
        </div>
        {unpaidDone && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[14px] font-medium text-amber-900">已完成但还未收款，收到款后请在下方改为「已收款」。</p>
        )}
      </section>

      {/* 修改状态 */}
      <Card title="订单状态" note={`状态更新于 ${formatTime(order.statusUpdatedAt)}`}>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="订单状态">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={order.status === status}
              disabled={saving === "status"}
              onClick={() => pickStatus(status)}
              className={`min-h-tap rounded-control border-2 text-[15px] font-semibold disabled:opacity-60 ${
                order.status === status ? "border-brand bg-brand-soft text-brand" : "border-line text-ink active:bg-page"
              }`}
            >
              {STATUS[status].label}
            </button>
          ))}
        </div>
        {order.cancellationReason && (
          <div className="mt-3 rounded-lg bg-page px-3 py-2.5">
            {editingReason ? (
              <div className="space-y-2">
                <TextArea
                  aria-label="取消原因"
                  rows={2}
                  maxLength={300}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={saving === "reason" || !reason.trim()}
                    onClick={async () => {
                      if (await save("reason", { cancellationReason: reason.trim() }, "已更新取消原因")) setEditingReason(false);
                    }}
                  >
                    保存原因
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setEditingReason(false)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] leading-relaxed text-ink">
                  <span className="text-muted">{order.status === "cancelled" ? "取消原因：" : "曾取消，原因："}</span>
                  {order.cancellationReason}
                  {order.cancellationReasonUpdatedAt && (
                    <span className="block text-[12px] text-faint">记录于 {formatTime(order.cancellationReasonUpdatedAt)}</span>
                  )}
                </p>
                {order.status === "cancelled" && (
                  <button
                    type="button"
                    onClick={() => {
                      setReason(order.cancellationReason ?? "");
                      setEditingReason(true);
                    }}
                    className="flex min-h-tap shrink-0 items-center text-[14px] text-brand"
                  >
                    修改
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 收款与金额 */}
      <Card title="收款" note={`收款状态更新于 ${formatTime(order.paymentStatusUpdatedAt)}`}>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="收款状态">
          {(["unpaid", "paid"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={order.paymentStatus === value}
              disabled={saving === "payment"}
              onClick={() => value !== order.paymentStatus && save("payment", { paymentStatus: value }, `已改为「${PAYMENT[value]}」`)}
              className={`min-h-[48px] rounded-control border-2 text-[16px] font-semibold disabled:opacity-60 ${
                order.paymentStatus === value
                  ? value === "paid"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-amber-500 bg-amber-50 text-amber-800"
                  : "border-line text-ink active:bg-page"
              }`}
            >
              {PAYMENT[value]}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="final-total" className="mb-1.5 block text-[15px] font-medium text-ink">
            最终确认金额（元）
          </label>
          <div className="flex gap-2">
            <TextInput
              id="final-total"
              inputMode="decimal"
              value={finalText}
              invalid={Boolean(finalError)}
              onChange={(event) => {
                setFinalText(event.target.value);
                setFinalError("");
              }}
              placeholder="与客户确认后的金额，含运费"
              maxLength={13}
              className="min-w-0 flex-1"
            />
            <Button className="shrink-0" disabled={saving === "final" || finalText === centsText(order.finalTotalCents)} onClick={() => saveFinal()}>
              保存
            </Button>
          </div>
          {finalError ? (
            <p className="mt-1.5 text-[14px] text-red-700">{finalError}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">
              预估商品金额 ¥{formatYuan(order.estimatedTotalCents)}（{hasNegotiable ? "不含面议商品和运费" : "不含运费"}）
              {order.finalTotalUpdatedAt && <span className="block text-faint">确认金额记录于 {formatTime(order.finalTotalUpdatedAt)}</span>}
            </p>
          )}
          {order.finalTotalCents !== null && (
            <button type="button" onClick={() => saveFinal(true)} disabled={saving === "final"} className="mt-1 min-h-tap text-[14px] text-muted underline underline-offset-2">
              清除确认金额
            </button>
          )}
        </div>
      </Card>

      {/* 客户信息 */}
      <Card title="客户信息">
        <dl className="divide-y divide-line text-[15px]">
          <Row label="联系人">{order.contactName}</Row>
          <Row label="手机号">
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular">{order.phone}</span>
              <a href={`tel:${order.phone}`} className="bg-brand-gradient inline-flex min-h-tap items-center gap-1 rounded-full px-4 text-[14px] font-bold text-white">
                <PhoneIcon size={16} />
                拨打
              </a>
              <button
                type="button"
                onClick={async () => toast((await copyText(order.phone)) ? "手机号已复制" : "复制失败，请长按手动复制")}
                className="inline-flex min-h-tap items-center gap-1 rounded-full border border-line px-3 text-[14px] text-ink"
              >
                <CopyIcon size={15} />
                复制
              </button>
            </span>
          </Row>
          <Row label="配送">{DELIVERY[order.deliveryMethod]}</Row>
          {order.address && (
            <Row label="地址">
              <span className="block break-words">{order.address}</span>
              <button
                type="button"
                onClick={async () => toast((await copyText(order.address ?? "")) ? "地址已复制" : "复制失败，请长按手动复制")}
                className="mt-1 inline-flex min-h-tap items-center gap-1 text-[14px] text-brand"
              >
                <CopyIcon size={15} />
                复制地址
              </button>
            </Row>
          )}
          <Row label="客户备注">{order.note ? <span className="break-words">{order.note}</span> : <span className="text-faint">无</span>}</Row>
        </dl>
      </Card>

      {/* 商品快照 */}
      <Card title={`订货商品（${order.items.length} 种）`} note="下单时的商品信息，之后修改或删除商品不影响这里">
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[15px] leading-snug text-ink">{item.name}</p>
                <p className="text-[13px] text-muted">
                  {[item.brand, item.model].filter(Boolean).join(" · ")}
                  {(item.brand || item.model) && " · "}
                  {item.unitPriceCents === null ? "面议" : `¥${formatYuan(item.unitPriceCents)}/${item.unit}`} × {item.quantity}
                  {item.unit}
                </p>
              </div>
              <span className={`tabular shrink-0 text-[15px] ${item.subtotalCents === null ? "font-semibold text-brand" : "font-bold text-ink"}`}>
                {item.subtotalCents === null ? "面议" : `¥${formatYuan(item.subtotalCents)}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-2.5">
          <span className="text-[14px] text-muted">预估商品金额</span>
          <span className="tabular text-[18px] font-extrabold text-accent">¥{formatYuan(order.estimatedTotalCents)}</span>
        </div>
      </Card>

      {/* 内部备注 */}
      <Card title="内部备注" note="只有店铺后台能看到，客户看不到">
        <TextArea
          aria-label="内部备注"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：已电话确认，运费 20 元；月结客户"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[12px] text-faint">{order.adminNoteUpdatedAt ? `更新于 ${formatTime(order.adminNoteUpdatedAt)}` : ""}</span>
          <Button disabled={saving === "note" || note.trim() === order.adminNote} onClick={() => save("note", { adminNote: note.trim() }, "内部备注已保存")}>
            保存备注
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "cancelled" ? "取消这笔订单" : "改为已完成"}
        message={
          confirm === "cancelled" ? (
            <div className="space-y-2">
              <p>请填写取消原因，方便以后查看。之后仍可改回其他状态。</p>
              <TextArea
                aria-label="取消原因"
                rows={3}
                maxLength={300}
                value={reason}
                invalid={Boolean(reasonError)}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError("");
                }}
                placeholder="例如：客户不要了；商品无货"
                autoFocus
              />
              {reasonError && <p className="text-[14px] text-red-700">{reasonError}</p>}
            </div>
          ) : (
            <>
              确认已经发货交付，或客户已经自提？
              {order.paymentStatus === "unpaid" && (
                <span className="mt-1 block text-amber-800">这笔订单目前还是「未收款」，完成后仍可随时记录收款。</span>
              )}
            </>
          )
        }
        confirmText={confirm === "cancelled" ? "确认取消订单" : "确认完成"}
        busy={saving === "status"}
        onConfirm={confirmStatus}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-card">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {note && <p className="mb-3 mt-0.5 text-[12px] text-faint">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}
