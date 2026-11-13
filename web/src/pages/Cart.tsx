import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/index.ts";
import type { CartLookupResult } from "../api/index.ts";
import {
  changeQuantity,
  MAX_QUANTITY,
  refreshSnapshots,
  removeFromCart,
  restoreToCart,
  setQuantity,
  useCart,
} from "../lib/cart.ts";
import type { CartLine } from "../lib/cart.ts";
import { brandModel, formatYuan } from "../lib/format.ts";
import { useShop } from "../lib/shop.tsx";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { TabBar } from "../components/TabBar.tsx";
import { CartIcon, CloseIcon, MinusIcon, PlusIcon } from "../components/icons.tsx";

type LookupItem = CartLookupResult["items"][number];
type Row = { line: CartLine; item?: LookupItem };

/** 撤销提示显示多久。 */
const UNDO_MS = 5000;

export function Cart() {
  const shop = useShop();
  const lines = useCart();
  const [info, setInfo] = useState<Map<string, LookupItem>>(new Map());
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{ line: CartLine; index: number } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const loading = useRef(new Set<string>());
  // 结算栏高度会随提示和文字折行变化，页面底部按实际高度留白，避免挡住最后一件商品。
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(132);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `购物车 - ${shop?.name ?? "五金订货"}`;
  }, [shop?.name]);

  /** 查询指定商品的最新价格和状态，结果合并进 info。 */
  const load = useCallback(async (ids: string[]) => {
    const todo = ids.filter((id) => !loading.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => loading.current.add(id));
    try {
      const result = await api.lookupCart(todo);
      setInfo((previous) => {
        const next = new Map(previous);
        result.items.forEach((item) => next.set(item.productId, item));
        return next;
      });
      refreshSnapshots(result.items.flatMap((item) => ("product" in item ? [item.product] : [])));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败，请重试。");
    } finally {
      todo.forEach((id) => loading.current.delete(id));
    }
  }, []);

  // 进入页面时查询全部；之后只查询新出现的商品（例如撤销移除、其他页面新加入）。
  const missing = lines.map((line) => line.productId).filter((id) => !info.has(id));
  const missingKey = missing.join(",");
  useEffect(() => {
    if (missing.length > 0 && !error) void load(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, error, load]);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const remove = (productId: string) => {
    const removed = removeFromCart(productId);
    if (!removed) return;
    window.clearTimeout(undoTimer.current);
    setUndo(removed);
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };

  const rows: Row[] = lines.map((line) => ({ line, item: info.get(line.productId) }));
  const blocked = rows.filter((row) => row.item && row.item.availability !== "available");
  const ready = rows.filter((row) => row.item?.availability === "available");
  const pending = rows.filter((row) => !row.item);

  let totalCents = 0;
  let hasNegotiable = false;
  for (const { line, item } of ready) {
    const price = item && "product" in item ? item.product.priceCents : null;
    if (price === null) hasNegotiable = true;
    else totalCents += price * line.quantity;
  }
  const canSubmit = lines.length > 0 && blocked.length === 0 && pending.length === 0 && !error;
  const bottomOffset = "calc(var(--tabbar-h) + var(--safe-bottom))";

  return (
    <div className="mx-auto min-h-screen max-w-shell" style={{ paddingBottom: lines.length ? `calc(var(--tabbar-h) + var(--safe-bottom) + ${barHeight + 16}px)` : undefined }}>
      <header className="sticky top-0 z-30 bg-page/95 px-4 pb-3 pt-4">
        <h1 className="text-[22px] font-extrabold text-ink">
          购物车
          {lines.length > 0 && <span className="ml-2 text-[15px] font-medium text-muted">共 {lines.length} 种</span>}
        </h1>
      </header>

      <main className="space-y-3 px-4">
        {lines.length === 0 ? (
          <EmptyCart />
        ) : error && pending.length > 0 ? (
          <ErrorNotice message={error} onRetry={() => setError("")} />
        ) : (
          <>
            {blocked.length > 0 && (
              <section className="overflow-hidden rounded-card bg-surface shadow-card" aria-labelledby="blocked-title">
                <div className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2.5">
                  <h2 id="blocked-title" className="text-[15px] font-bold text-amber-900">
                    以下商品暂时无法订购
                  </h2>
                  <button
                    type="button"
                    onClick={() => blocked.forEach((row) => removeFromCart(row.line.productId))}
                    className="flex min-h-tap items-center text-[14px] font-medium text-amber-900 underline underline-offset-2"
                  >
                    全部移除
                  </button>
                </div>
                <ul className="divide-y divide-line">
                  {blocked.map((row) => (
                    <BlockedRow key={row.line.productId} row={row} onRemove={() => remove(row.line.productId)} />
                  ))}
                </ul>
              </section>
            )}

            {ready.length > 0 && (
              <ul className="space-y-3">
                {ready.map((row) => (
                  <ReadyRow key={row.line.productId} row={row} onRemove={() => remove(row.line.productId)} />
                ))}
              </ul>
            )}

            {pending.length > 0 && (
              <ul className="space-y-3" aria-hidden="true">
                {pending.map((row) => (
                  <li key={row.line.productId} className="flex gap-3 rounded-card bg-surface p-3 shadow-card">
                    <div className="skeleton h-20 w-20 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-4 w-4/5" />
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton mt-4 h-5 w-1/3" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {/* 撤销移除 */}
      {undo && (
        <div className="fixed inset-x-0 z-40 px-4" style={{ bottom: `calc(${bottomOffset} + ${barHeight + 8}px)` }}>
          <div className="animate-fade mx-auto flex max-w-shell items-center justify-between gap-3 rounded-control bg-ink/90 py-1 pl-4 pr-1 text-white shadow-float">
            <span className="min-w-0 truncate text-[15px]">已移除「{undo.line.name ?? "商品"}」</span>
            <button
              type="button"
              onClick={() => {
                restoreToCart(undo.line, undo.index);
                setUndo(null);
                window.clearTimeout(undoTimer.current);
              }}
              className="flex min-h-tap shrink-0 items-center rounded-control px-4 text-[15px] font-bold text-[#ffd56b] active:bg-white/10"
            >
              撤销
            </button>
          </div>
        </div>
      )}

      {/* 结算栏：在底部导航上方 */}
      {lines.length > 0 && (
        <div ref={barRef} className="fixed inset-x-0 z-30 border-t border-line/70 bg-surface shadow-bar" style={{ bottom: bottomOffset }}>
          <div className="mx-auto max-w-shell px-4 pb-3 pt-2.5">
            {blocked.length > 0 && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[13px] text-amber-900">请先移除暂时无法订购的商品，再提交订货单</p>
            )}
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-muted">
                  预估商品金额<span className="text-faint">（不含待确认运费）</span>
                </p>
                <p className="tabular text-accent">
                  <span className="text-[15px] font-bold">¥</span>
                  <span className="text-[26px] font-extrabold leading-tight">{pending.length ? "--" : formatYuan(totalCents)}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => toast("提交订货单页面将在下一步开放")}
                className="bg-accent-gradient h-12 shrink-0 rounded-full px-6 text-[16px] font-bold text-white shadow-accent disabled:bg-none disabled:bg-line disabled:text-faint disabled:shadow-none"
              >
                去提交订货单
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-faint">
              {hasNegotiable && "不含面议商品。"}最终金额以商家联系确认为准
            </p>
          </div>
        </div>
      )}

      <TabBar />
    </div>
  );
}

function ReadyRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  const { line, item } = row;
  if (!item || !("product" in item)) return null;
  const product = item.product;
  const sub = brandModel(product.brand, product.model);
  const subtotal = product.priceCents === null ? null : product.priceCents * line.quantity;

  return (
    <li className="relative rounded-card bg-surface p-3 shadow-card">
      <div className="flex gap-3">
        <Link to={`/p/${product.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-white">
          <img src={product.mainImage.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-contain" />
        </Link>
        <div className="min-w-0 flex-1 pr-8">
          <Link to={`/p/${product.id}`} className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            {product.name}
          </Link>
          {sub && <p className="mt-0.5 truncate text-[13px] text-muted">{sub}</p>}
          <p className="mt-1 text-[13px] text-muted">
            {product.priceCents === null ? (
              <span className="font-semibold text-brand">价格面议</span>
            ) : (
              <>
                参考价 <span className="tabular text-ink">¥{formatYuan(product.priceCents)}</span>/{product.unit}
              </>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除 ${product.name}`}
        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center text-faint active:text-ink"
      >
        <CloseIcon size={18} />
      </button>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
        <p className="min-w-0 text-[14px] text-muted">
          小计{" "}
          {subtotal === null ? (
            <span className="font-semibold text-brand">面议</span>
          ) : (
            <span className="tabular text-[16px] font-bold text-accent">¥{formatYuan(subtotal)}</span>
          )}
        </p>
        <QuantityStepper productId={line.productId} quantity={line.quantity} unit={product.unit} />
      </div>
    </li>
  );
}

function BlockedRow({ row, onRemove }: { row: Row; onRemove: () => void }) {
  const { line, item } = row;
  const product = item && "product" in item ? item.product : undefined;
  const name = product?.name ?? line.name ?? "商品已不可订";
  const reason = item?.availability === "out_of_stock" ? "暂时缺货" : "已下架";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-page">
        {/* 已下架的商品图片可能已被清理，只显示缺货商品的图片 */}
        {product && <img src={product.mainImage.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-contain opacity-50 grayscale" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] leading-snug text-muted">{name}</p>
        <p className="mt-0.5 text-[13px]">
          <span className="rounded bg-ink/70 px-1.5 py-0.5 text-[12px] text-white">{reason}</span>
          <span className="ml-2 text-faint">×{line.quantity}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex min-h-tap shrink-0 items-center rounded-full border border-line px-4 text-[14px] font-medium text-ink active:bg-page"
      >
        移除
      </button>
    </li>
  );
}

function QuantityStepper({ productId, quantity, unit }: { productId: string; quantity: number; unit: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const step = "flex h-10 w-10 items-center justify-center text-ink active:bg-page disabled:text-faint/50";

  const commit = (text: string) => {
    const digits = text.replace(/\D/g, "");
    setQuantity(productId, digits === "" ? 1 : Number(digits));
    setDraft(null);
  };

  return (
    <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-full border border-line" role="group" aria-label={`数量（${unit}）`}>
      <button type="button" aria-label="减少数量" disabled={quantity <= 1} onClick={() => changeQuantity(productId, -1)} className={step}>
        <MinusIcon size={16} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="数量"
        value={draft ?? String(quantity)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
          setDraft(digits);
          if (digits !== "") setQuantity(productId, Number(digits));
        }}
        onFocus={(event) => event.target.select()}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
        className="tabular h-10 w-12 border-x border-line bg-transparent text-center text-[16px] font-semibold focus:outline-none"
      />
      <button
        type="button"
        aria-label="增加数量"
        disabled={quantity >= MAX_QUANTITY}
        onClick={() => changeQuantity(productId, 1)}
        className={step}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}

function EmptyCart() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand">
        <CartIcon size={38} strokeWidth={1.6} />
      </span>
      <p className="mt-4 text-[17px] font-semibold text-ink">购物车还是空的</p>
      <p className="mt-1 text-[14px] text-muted">挑选好商品后，在这里提交订货单</p>
      <Link
        to="/"
        className="bg-brand-gradient mt-6 inline-flex min-h-tap items-center rounded-full px-8 text-[16px] font-bold text-white shadow-brand"
      >
        去选购
      </Link>
    </div>
  );
}
