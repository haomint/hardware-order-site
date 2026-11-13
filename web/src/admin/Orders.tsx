import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { OrderPage, OrderStatus } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { formatYuan } from "../lib/format.ts";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { CloseIcon, SearchIcon } from "../components/icons.tsx";
import { OrderExportButton } from "./OrderExport.tsx";
import { DELIVERY, formatTime, PAYMENT, STATUS, STATUS_ORDER } from "./orderLabels.ts";

const PAGE_SIZE = 20;
type Summary = OrderPage["items"][number];

/** 筛选：全部、五种状态，以及「已完成未收款」（赊账待收）。 */
type Filter = "all" | OrderStatus | "unpaid_done";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  ...STATUS_ORDER.map((status) => ({ key: status as Filter, label: STATUS[status].label })),
  { key: "unpaid_done", label: "已完成未收款" },
];

export function Orders() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const filter = (FILTERS.find((f) => f.key === params.get("s"))?.key ?? "all") as Filter;
  const unpaidOnly = params.get("unpaid") === "1";

  // 延迟搜索触发时，筛选条件可能已经变了：始终以最新一次渲染时的地址为准。
  const latest = useRef(params);
  latest.current = params;
  const setQuery = (next: { q?: string; s?: Filter; unpaid?: boolean }) => {
    const current = latest.current;
    const merged = {
      q: current.get("q") ?? "",
      s: (FILTERS.find((f) => f.key === current.get("s"))?.key ?? "all") as Filter,
      unpaid: current.get("unpaid") === "1",
      ...next,
    };
    const search = new URLSearchParams();
    if (merged.q.trim()) search.set("q", merged.q.trim());
    if (merged.s !== "all") search.set("s", merged.s);
    if (merged.unpaid && merged.s !== "unpaid_done") search.set("unpaid", "1");
    if (search.toString() !== current.toString()) setParams(search, { replace: true });
  };

  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft.trim() === q) return;
    const timer = window.setTimeout(() => {
      if (draft.trim() !== (latest.current.get("q") ?? "")) setQuery({ q: draft });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const apiQuery = {
    q: q || undefined,
    status: filter === "unpaid_done" ? ("completed" as const) : filter === "all" ? undefined : filter,
    paymentStatus: filter === "unpaid_done" || unpaidOnly ? ("unpaid" as const) : undefined,
  };

  const [extra, setExtra] = useState<Summary[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const first = useAsync(() => {
    setExtra([]);
    return api.listAdminOrders({ ...apiQuery, page: "1", pageSize: String(PAGE_SIZE) });
  }, [q, filter, unpaidOnly, refreshKey]);

  const items = first.state.status === "ready" ? [...first.state.data.items, ...extra] : [];
  const total = first.state.status === "ready" ? first.state.data.total : 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / PAGE_SIZE) + 1;
      const next = await api.listAdminOrders({ ...apiQuery, page: String(page), pageSize: String(PAGE_SIZE) });
      setExtra((previous) => [...previous, ...next.items]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "加载失败，请重试。");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">按订单号或手机号搜索</span>
          <SearchIcon size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="订单号或手机号"
            maxLength={32}
            className="h-12 w-full appearance-none rounded-control border border-line bg-surface pl-10 pr-10 text-base placeholder:text-faint focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {draft !== "" && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setDraft("");
                setQuery({ q: "" });
              }}
              className="absolute right-0 top-0 flex h-12 w-10 items-center justify-center text-faint"
            >
              <CloseIcon size={18} />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setRefreshKey((n) => n + 1)}
          className="flex h-12 shrink-0 items-center rounded-control border border-line bg-surface px-4 text-[15px] font-medium text-brand active:bg-brand-soft"
        >
          刷新
        </button>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="按状态筛选">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setQuery({ s: item.key })}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-4 text-[15px] font-medium ${
              filter === item.key
                ? item.key === "unpaid_done"
                  ? "bg-amber-600 text-white"
                  : "bg-brand text-white"
                : "border border-line bg-surface text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {filter !== "unpaid_done" ? (
          <label className="flex min-h-tap w-fit cursor-pointer items-center gap-2 text-[15px] text-ink">
            <input
              type="checkbox"
              checked={unpaidOnly}
              onChange={(event) => setQuery({ unpaid: event.target.checked })}
              className="h-5 w-5 accent-[rgb(var(--c-brand))]"
            />
            只看未收款
          </label>
        ) : (
          <span />
        )}
        <OrderExportButton />
      </div>

      <div className="mt-2">
        {first.state.status === "error" ? (
          <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
        ) : first.state.status === "loading" && items.length === 0 ? (
          <p className="py-10 text-center text-muted">正在加载…</p>
        ) : items.length === 0 ? (
          <EmptyNotice title={q || filter !== "all" || unpaidOnly ? "没有符合条件的订单" : "还没有订单"}>
            {!q && filter === "all" && !unpaidOnly ? (
              <p>客户在商城提交订货单后，会显示在这里。</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setParams(new URLSearchParams(), { replace: true });
                }}
                className="mt-2 min-h-tap rounded-control border border-line bg-surface px-4 text-base text-brand"
              >
                清除搜索和筛选
              </button>
            )}
          </EmptyNotice>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">共 {total} 笔</p>
            <ul className="space-y-2">
              {items.map((order) => (
                <li key={order.orderNo}>
                  <OrderRow order={order} />
                </li>
              ))}
            </ul>
            {items.length < total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-4 min-h-tap w-full rounded-control border border-line bg-surface text-base font-medium text-brand disabled:text-faint"
              >
                {loadingMore ? "正在加载…" : "加载更多"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: Summary }) {
  const status = STATUS[order.status];
  const unpaidDone = order.status === "completed" && order.paymentStatus === "unpaid";
  const preview = order.itemsPreview.map((item) => `${item.name} ×${item.quantity}`).join("、");
  const amount = order.finalTotalCents ?? order.estimatedTotalCents;

  return (
    <Link
      to={`/admin/orders/${order.orderNo}`}
      className={`block rounded-card bg-surface p-3 shadow-card active:opacity-80 ${unpaidDone ? "border-l-4 border-amber-500" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="tabular text-[13px] text-muted">{order.orderNo}</span>
        <span className="text-[13px] text-muted">{formatTime(order.createdAt, true)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[16px] font-semibold text-ink">
          {order.contactName}
          <span className="tabular ml-2 text-[14px] font-normal text-muted">尾号 {order.phone.slice(-4)}</span>
        </p>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[13px] font-medium ${status.className}`}>{status.label}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-ink/80">
        {preview}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted">
          {order.itemCount} 种 · {DELIVERY[order.deliveryMethod]} ·{" "}
          <span className={order.paymentStatus === "paid" ? "text-emerald-700" : unpaidDone ? "font-bold text-amber-700" : ""}>
            {unpaidDone ? "已完成但未收款" : PAYMENT[order.paymentStatus]}
          </span>
        </span>
        <span className="tabular text-[15px] font-bold text-ink">
          <span className="mr-1 text-[12px] font-normal text-muted">{order.finalTotalCents === null ? "预估" : "确认"}</span>¥
          {formatYuan(amount)}
        </span>
      </div>
    </Link>
  );
}
