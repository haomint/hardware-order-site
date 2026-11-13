import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { Category, ProductListItem } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { HeroBanner } from "../components/HeroBanner.tsx";
import { CategoryIcon } from "../components/Art.tsx";
import { CartBadge, openCart, TabBar } from "../components/TabBar.tsx";
import { CartIcon, ChevronRightIcon, CloseIcon, PhoneIcon, SearchIcon } from "../components/icons.tsx";

const PAGE_SIZE = 20;
/** 首页宫格最多显示的分类数，多出的放进「全部分类」。 */
const GRID_LIMIT = 8;

export function Home() {
  const shop = useShop();
  const listRef = useRef<HTMLDivElement>(null);

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

  // 输入时先更新输入框，停顿片刻后再搜索；点「搜索」立即搜索。
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft.trim() === q) return;
    const timer = window.setTimeout(() => setFilter({ q: draft }), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const scrollToList = () => {
    const el = listRef.current;
    if (!el) return;
    // 留出顶部吸附搜索栏的高度。
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: "smooth" });
  };

  const categories = useAsync(() => api.listCategories(), []);
  const categoryList: Category[] = categories.state.status === "ready" ? categories.state.data.items : [];
  const currentCategory = categoryList.find((c) => c.id === categoryId);

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

  const filtered = q !== "" || categoryId !== "";
  const showHero = !filtered;
  // 分类刚好 5 个或超过 8 个时每行排 5 个，其余每行 4 个，避免最后一行只剩一两个。
  const fiveCols = categoryList.length === 5 || categoryList.length > GRID_LIMIT;
  const gridLimit = fiveCols && categoryList.length > GRID_LIMIT ? 10 : GRID_LIMIT;
  const gridItems = categoryList.length > gridLimit ? categoryList.slice(0, gridLimit - 1) : categoryList;
  const hasMore = categoryList.length > gridLimit;

  const title = q ? `“${q}”的搜索结果` : (currentCategory?.name ?? "全部商品");

  return (
    <div className="pb-tabbar mx-auto min-h-screen max-w-shell">
      {/* 头部：店名、电话、购物车 */}
      <header className="relative bg-gradient-to-b from-white to-page px-4 pb-1 pt-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white shadow-brand">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M21.7 6.3a5.5 5.5 0 0 1-7.4 6.8l-7.9 7.9a2.1 2.1 0 0 1-3-3l7.9-7.9a5.5 5.5 0 0 1 6.8-7.4l-3.3 3.3.6 2.9 2.9.6z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-extrabold leading-tight text-ink">{shop?.name ?? " "}</h1>
            <p className="truncate text-[12px] text-muted">线上选货 · 店家确认</p>
          </div>
          {shop?.phone && (
            <a
              href={`tel:${shop.phone}`}
              aria-label={`拨打店铺电话 ${shop.phone}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-card active:bg-brand-soft"
            >
              <PhoneIcon size={21} />
            </a>
          )}
          <button
            type="button"
            onClick={openCart}
            aria-label="购物车"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-card active:bg-brand-soft"
          >
            <CartIcon size={22} />
            <CartBadge className="-right-0.5 -top-0.5" />
          </button>
        </div>
      </header>

      {/* 搜索栏：滚动时吸附在顶部 */}
      <div className="sticky top-0 z-30 bg-page/95 px-4 pb-3 pt-3">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ q: draft });
            (document.activeElement as HTMLElement | null)?.blur();
            scrollToList();
          }}
          className="flex h-[52px] items-center rounded-full border-[1.5px] border-brand bg-surface pl-4 pr-1 shadow-card focus-within:shadow-brand"
        >
          <SearchIcon size={20} className="shrink-0 text-faint" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">搜索商品</span>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="搜索商品名、品牌或型号"
              maxLength={100}
              className="h-11 w-full appearance-none bg-transparent px-2 text-base text-ink placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          {draft !== "" && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setDraft("");
                setFilter({ q: "" });
              }}
              className="flex h-11 w-9 shrink-0 items-center justify-center text-faint"
            >
              <CloseIcon size={18} />
            </button>
          )}
          <button
            type="submit"
            className="bg-accent-gradient h-11 shrink-0 rounded-full px-5 text-[16px] font-bold text-white shadow-accent"
          >
            搜索
          </button>
        </form>
      </div>

      <div className="space-y-4 px-4">
        {showHero && <HeroBanner onBrowse={scrollToList} />}

        {/* 分类宫格 */}
        {(categoryList.length > 0 || categories.state.status === "loading") && (
          <nav aria-label="商品分类" className="rounded-[20px] bg-surface px-2 py-4 shadow-card">
            <ul className={`grid gap-y-4 ${fiveCols ? "grid-cols-5" : "grid-cols-4"}`}>
              {categories.state.status === "loading" &&
                Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="flex flex-col items-center gap-2" aria-hidden="true">
                    <span className="skeleton h-14 w-14 rounded-2xl" />
                    <span className="skeleton h-3 w-12" />
                  </li>
                ))}
              {gridItems.map((category) => {
                const active = category.id === categoryId;
                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFilter({ c: active ? "" : category.id });
                        if (!active) window.setTimeout(scrollToList, 50);
                      }}
                      className="flex w-full flex-col items-center gap-1.5 active:opacity-70"
                    >
                      <CategoryIcon name={category.name} active={active} size={fiveCols ? 52 : 56} />
                      <span
                        className={`max-w-full truncate px-1 text-[13px] ${active ? "font-bold text-brand" : "font-medium text-ink"}`}
                      >
                        {category.name}
                      </span>
                    </button>
                  </li>
                );
              })}
              {hasMore && (
                <li>
                  <Link to="/categories" className="flex w-full flex-col items-center gap-1.5 active:opacity-70">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-page text-muted">
                      <ChevronRightIcon size={24} />
                    </span>
                    <span className="text-[13px] font-medium text-ink">全部分类</span>
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}

        {/* 商品列表 */}
        <section ref={listRef} aria-labelledby="list-title">
          <div className="mb-3 flex items-center justify-between gap-3 pt-1">
            <h2 id="list-title" className="flex min-w-0 items-center gap-2 text-[18px] font-extrabold text-ink">
              <span className="h-[18px] w-1 shrink-0 rounded-full bg-accent-gradient" aria-hidden="true" />
              <span className="truncate">{title}</span>
            </h2>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setParams(new URLSearchParams(), { replace: true });
                }}
                className="flex min-h-tap shrink-0 items-center gap-0.5 text-[14px] text-muted"
              >
                <CloseIcon size={15} />
                清除筛选
              </button>
            ) : (
              <span className="shrink-0 text-[13px] text-faint" aria-live="polite">
                {refreshing ? "" : `共 ${total} 种`}
              </span>
            )}
          </div>

          {first.state.status === "error" ? (
            <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
          ) : refreshing && stale === undefined ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 4 }, (_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : shown.length === 0 && !refreshing ? (
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
                    className="mt-4 min-h-tap rounded-full border border-brand px-6 text-base font-medium text-brand active:bg-brand-soft"
                  >
                    查看全部商品
                  </button>
                </>
              )}
            </EmptyNotice>
          ) : (
            <>
              {filtered && !refreshing && <p className="-mt-1 mb-3 text-[13px] text-faint">共 {total} 种</p>}
              <div className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 ${refreshing ? "opacity-50" : ""}`}>
                {shown.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {!refreshing && items.length < total && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-5 min-h-tap w-full rounded-full border border-line bg-surface text-base font-medium text-brand active:bg-brand-soft disabled:text-faint"
                >
                  {loadingMore ? "正在加载…" : "加载更多"}
                </button>
              )}
              {!refreshing && items.length >= total && total > 6 && (
                <p className="mt-6 text-center text-[13px] text-faint">— 已经到底了 —</p>
              )}
            </>
          )}
        </section>

        <footer className="pt-4 text-center text-[13px] leading-relaxed text-faint">
          <p>页面价格为参考价，最终金额以商家联系确认为准</p>
          {shop?.wechatContactText && <p>{shop.wechatContactText}</p>}
        </footer>
      </div>

      <TabBar />
    </div>
  );
}
