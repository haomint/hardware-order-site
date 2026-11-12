import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { ProductListItem } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { useCartCount } from "../lib/cart.ts";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { CartIcon, CloseIcon, PhoneIcon, SearchIcon } from "../components/icons.tsx";

const PAGE_SIZE = 20;

export function Home() {
  const shop = useShop();
  const cartCount = useCartCount();

  // 搜索词和分类放在地址里：返回列表时保持原状，转发链接也能带上筛选条件。
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoryId = params.get("c") ?? "";

  const setFilter = (next: { q?: string; c?: string }) => {
    const merged = { q, c: categoryId, ...next };
    const search = new URLSearchParams();
    if (merged.q.trim()) search.set("q", merged.q.trim());
    if (merged.c) search.set("c", merged.c);
    setParams(search, { replace: true });
  };

  // 输入时先更新输入框，停顿片刻后再发起搜索。
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft.trim() === q) return;
    const timer = window.setTimeout(() => setFilter({ q: draft }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const categories = useAsync(() => api.listCategories(), []);

  const [extra, setExtra] = useState<ProductListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useAsync(() => {
    setExtra([]);
    return api.listProducts({ q, categoryId, page: "1", pageSize: String(PAGE_SIZE) });
  }, [q, categoryId]);

  const items = first.state.status === "ready" ? [...first.state.data.items, ...extra] : [];
  const total = first.state.status === "ready" ? first.state.data.total : 0;
  const refreshing = first.state.status === "loading";
  // 切换分类或搜索时，先保留上一批结果并变淡，避免页面闪成空白。
  const stale = first.state.status === "loading" ? first.state.data : undefined;
  const shown = first.state.status === "ready" ? items : (stale?.items ?? []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / PAGE_SIZE) + 1;
      const next = await api.listProducts({ q, categoryId, page: String(page), pageSize: String(PAGE_SIZE) });
      setExtra((previous) => [...previous, ...next.items]);
    } catch (error) {
      toast(error instanceof Error ? error.message : "加载失败，请重试。");
    } finally {
      setLoadingMore(false);
    }
  };

  const categoryList = categories.state.status === "ready" ? categories.state.data.items : [];
  const filtered = q !== "" || categoryId !== "";

  return (
    <div className="mx-auto min-h-screen max-w-shell pb-10">
      <header className="bg-brand px-4 pb-4 pt-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{shop?.name ?? " "}</h1>
            <p className="mt-0.5 text-sm text-white/80">选货下单，店家联系确认</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {shop?.phone && (
              <a
                href={`tel:${shop.phone}`}
                aria-label={`拨打店铺电话 ${shop.phone}`}
                className="flex min-h-tap items-center gap-1.5 rounded-control bg-white/15 px-3 text-sm font-medium active:bg-white/25"
              >
                <PhoneIcon size={18} />
                电话
              </a>
            )}
            <button
              type="button"
              onClick={() => toast("购物车将在下一阶段开放")}
              aria-label={`购物车，已选 ${cartCount} 种商品`}
              className="relative flex min-h-tap min-w-tap items-center justify-center rounded-control bg-white/15 active:bg-white/25"
            >
              <CartIcon />
              {cartCount > 0 && (
                <span className="tabular absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-line bg-page/95 backdrop-blur">
        <form
          role="search"
          className="px-4 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ q: draft });
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <label className="relative block">
            <span className="sr-only">搜索商品</span>
            <SearchIcon size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="搜索商品名、品牌或型号"
              maxLength={100}
              className="h-12 w-full appearance-none rounded-control border border-line bg-surface pl-10 pr-11 text-base text-ink placeholder:text-faint focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {draft !== "" && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => {
                  setDraft("");
                  setFilter({ q: "" });
                }}
                className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center text-faint"
              >
                <CloseIcon size={18} />
              </button>
            )}
          </label>
        </form>

        <nav aria-label="商品分类" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          <CategoryChip label="全部" active={categoryId === ""} onClick={() => setFilter({ c: "" })} />
          {categoryList.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              onClick={() => setFilter({ c: category.id })}
            />
          ))}
          {categories.state.status === "loading" &&
            [72, 88, 64].map((width) => (
              <span key={width} className="skeleton h-10 shrink-0 rounded-full" style={{ width }} />
            ))}
        </nav>
      </div>

      <main className="px-4 pt-4">
        {first.state.status === "error" ? (
          <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
        ) : refreshing && stale === undefined ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : items.length === 0 && !refreshing ? (
          <EmptyNotice title={filtered ? "没有找到相关商品" : "店铺还没有上架商品"}>
            {filtered && (
              <>
                <p>换个关键词试试，或直接联系店铺询问。</p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft("");
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                  className="mt-4 min-h-tap rounded-control border border-brand px-5 text-base font-medium text-brand active:bg-brand-soft"
                >
                  查看全部商品
                </button>
              </>
            )}
          </EmptyNotice>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted" aria-live="polite">
              {refreshing ? "正在加载…" : `共 ${total} 种商品`}
            </p>
            <div
              className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 ${refreshing ? "opacity-50" : ""}`}
            >
              {shown.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {!refreshing && items.length < total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-5 min-h-tap w-full rounded-control border border-line bg-surface text-base font-medium text-brand active:bg-brand-soft disabled:text-faint"
              >
                {loadingMore ? "正在加载…" : "加载更多"}
              </button>
            )}
            {!refreshing && items.length >= total && total > 6 && (
              <p className="mt-6 text-center text-sm text-faint">已经到底了</p>
            )}
          </>
        )}
      </main>

      <footer className="mt-10 px-4 text-center text-sm text-muted">
        <p>页面价格为参考价，最终金额以商家联系确认为准</p>
        {shop?.wechatContactText && <p className="mt-1">{shop.wechatContactText}</p>}
      </footer>
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-4 text-[15px] font-medium transition-colors ${
        active ? "bg-brand text-white" : "border border-line bg-surface text-ink active:bg-brand-soft"
      }`}
    >
      {label}
    </button>
  );
}
