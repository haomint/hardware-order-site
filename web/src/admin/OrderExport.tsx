// 订单导出：选日期范围，下载 CSV 表格（Excel、WPS 都能打开）。
import { useEffect, useState } from "react";
import { api, ApiError } from "../api/index.ts";
import { toast } from "../components/Feedback.tsx";
import { CloseIcon } from "../components/icons.tsx";
import { Button, TextInput } from "./ui.tsx";

// ── 北京时间的日期计算，日期一律用 "2026-11-13" 这样的字符串 ──

const ymdFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" });
const todayYmd = () => ymdFormat.format(new Date());
function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
/** 北京时间某天零点对应的 UTC 时间。 */
const beijingMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();
const validYmd = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

type Preset = "this_month" | "last_month" | "last_7" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "this_month", label: "本月" },
  { key: "last_month", label: "上月" },
  { key: "last_7", label: "最近 7 天" },
  { key: "custom", label: "自定义" },
];

function presetRange(preset: Exclude<Preset, "custom">): [string, string] {
  const today = todayYmd();
  const monthStart = `${today.slice(0, 8)}01`;
  if (preset === "this_month") return [monthStart, today];
  if (preset === "last_7") return [addDays(today, -6), today];
  const lastMonthEnd = addDays(monthStart, -1);
  return [`${lastMonthEnd.slice(0, 8)}01`, lastMonthEnd];
}

const inWeChat = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);

/** 订单列表上的「导出表格」按钮和弹出面板。 */
export function OrderExportButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-tap shrink-0 items-center rounded-control px-2 text-[15px] font-medium text-brand active:bg-brand-soft"
      >
        导出表格
      </button>
      {open && <ExportSheet onClose={() => setOpen(false)} />}
    </>
  );
}

type Count = { status: "loading" } | { status: "ready"; total: number } | { status: "error"; message: string };

function ExportSheet({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState<Preset>("this_month");
  const [[start, end], setRange] = useState(() => presetRange("this_month"));
  const [count, setCount] = useState<Count>({ status: "loading" });
  const [downloading, setDownloading] = useState(false);
  const today = todayYmd();

  const rangeError = !validYmd(start) || !validYmd(end) ? "请选择开始和结束日期。" : end < start ? "结束日期不能早于开始日期。" : "";
  const from = rangeError ? "" : beijingMidnight(start);
  const to = rangeError ? "" : beijingMidnight(addDays(end, 1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 选好范围后先查一下有几笔，没有订单时直接提示，不下载空表格。
  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    setCount({ status: "loading" });
    const timer = window.setTimeout(() => {
      api
        .listAdminOrders({ from, to, page: "1", pageSize: "1" })
        .then((page) => !cancelled && setCount({ status: "ready", total: page.total }))
        .catch((error) => !cancelled && setCount({ status: "error", message: error instanceof ApiError ? error.message : "查询失败，请重试。" }));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [from, to]);

  const pick = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next));
  };

  const download = async () => {
    setDownloading(true);
    try {
      const link = await api.orderExportLink(from, to);
      const a = document.createElement("a");
      a.href = link.url;
      a.download = link.filename ?? "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (link.url.startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(link.url), 60_000);
      toast("已开始下载，可用 Excel 或 WPS 打开");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "下载失败，请重试。");
    } finally {
      setDownloading(false);
    }
  };

  const empty = count.status === "ready" && count.total === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="pb-safe w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="export-title" className="text-lg font-bold text-ink">
              导出订单表格
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">按下单日期选择，包含客户、商品明细、金额和状态。</p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-muted">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="时间范围">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={preset === item.key}
              onClick={() => pick(item.key)}
              className={`min-h-tap whitespace-nowrap rounded-control border-2 px-1 text-[15px] font-medium ${
                preset === item.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink active:bg-page"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[14px] text-muted">开始日期</span>
            <TextInput
              type="date"
              value={start}
              max={today}
              invalid={Boolean(rangeError)}
              onChange={(event) => {
                setPreset("custom");
                setRange([event.target.value, end]);
              }}
              className="min-w-0 px-2"
            />
          </label>
          <span className="pb-3 text-muted">至</span>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[14px] text-muted">结束日期</span>
            <TextInput
              type="date"
              value={end}
              max={today}
              invalid={Boolean(rangeError)}
              onChange={(event) => {
                setPreset("custom");
                setRange([start, event.target.value]);
              }}
              className="min-w-0 px-2"
            />
          </label>
        </div>

        <div className="mt-3 min-h-[24px] text-[15px]" aria-live="polite">
          {rangeError ? (
            <p className="text-red-700">{rangeError}</p>
          ) : count.status === "loading" ? (
            <p className="text-muted">正在统计…</p>
          ) : count.status === "error" ? (
            <p className="text-red-700">{count.message}</p>
          ) : empty ? (
            <p className="rounded-lg bg-page px-3 py-2 text-ink">这段时间没有订单，换个日期试试。</p>
          ) : (
            <p className="text-ink">
              共 <span className="tabular font-bold">{count.total}</span> 笔订单
            </p>
          )}
        </div>

        {inWeChat && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[14px] leading-relaxed text-amber-900">
            微信里不能直接下载文件。请点右上角「···」，选「在浏览器打开」，登录后再导出。
          </p>
        )}

        <Button
          className="mt-4 w-full"
          disabled={Boolean(rangeError) || count.status !== "ready" || empty || downloading}
          onClick={download}
        >
          {downloading ? "正在准备…" : "下载表格"}
        </Button>
      </div>
    </div>
  );
}
