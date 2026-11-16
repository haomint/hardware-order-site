import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { Category, ProductListItem } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { useWhitePage } from "../lib/useWhitePage.ts";
import { ProductRow, ProductRowSkeleton } from "../components/ProductCard.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { BannerCarousel } from "../components/BannerCarousel.tsx";
import type { BannerAction } from "../components/BannerCarousel.tsx";
import { CategoryIcon } from "../components/Art.tsx";
import { CartBadge, TabBar } from "../components/TabBar.tsx";
import { CartIcon, ChevronRightIcon, CloseIcon, PhoneIcon, SearchIcon } from "../components/icons.tsx";
import { openContact } from "../components/ContactSheet.tsx";

const PAGE_SIZE = 20;
/** 分类不超过这个数时平均排满一行，超过时可左右滑动。 */
const ROW_FIT = 6;

export function Home() {
  const shop = useShop();
  useWhitePage();
  const listRef = useRef<HTMLElement>(null);

  // 搜索词和分类放在地址里：返回列表时保持原状，转发链接也能带上筛选条件。
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoryId = params.get("c") ?? "";

  // 延迟搜索触发时筛选条件可能已经变了（例如刚点了「查看全部商品」）：始终以最新的地址为准。
  const latest = useRef(params);
  latest.current = params;
  const setFilter = (next: { q?: string; c?: string }) => {
    const current = latest.current;
    const merged = { q: current.get("q") ?? "", c: current.get("c") ?? "", ...next };
    const search = new URLSearchParams();
    if (merged.q.trim()) search.set("q", merged.q.trim());
    if (merged.c) search.set("c", merged.c);
    if (search.toString() !== current.toString()) setParams(search, { replace: true });
  };

  // 输入时只改输入框，不搜索；点「搜索」或键盘上的搜索键才搜（店主要求，#64）。点 × 清空则立即回到全部商品。
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const scrollToList = () => {
    const el = listRef.current;
    if (!el) return;
    // 留出顶部吸附搜索栏的高度。
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  };

  // 搜索或切换分类会收起横幅、列表位置随之上移：等筛选后的页面渲染好再量位置滚动。
  const pendingScroll = useRef(false);
  const scrollAfterFilter = (willChange: boolean) => {
    if (willChange) pendingScroll.current = true;
    else scrollToList();
  };
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    window.requestAnimationFrame(scrollToList);
  }, [q, categoryId]);

  const categories = useAsync(() => api.listCategories(), []);
  const categoryList: Category[] = categories.state.status === "ready" ? categories.state.data.items : [];
  const categoryName = (id: string) => categoryList.find((c) => c.id === id)?.name;
  const currentCategory = categoryList.find((c) => c.id === categoryId);

  const [extra, setExtra] = useState<ProductListItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  // 换筛选、搜索或刷新时换一代；还在路上的「加载更多」属于旧一代，回来后直接丢弃。
  const generation = useRef(0);
  const first = useAsync(() => {
    generation.current += 1;
    setExtra([]);
    setLoadingMore(false);
    return api.listProducts({ q, categoryId, page: "1", pageSize: String(PAGE_SIZE) });
  }, [q, categoryId]);

  const items = first.state.status === "ready" ? [...first.state.data.items, ...extra] : [];
  const total = first.state.status === "ready" ? first.state.data.total : 0;
  const refreshing = first.state.status === "loading";
  // 切换分类或搜索时，先保留上一批结果并变淡，避免页面闪成空白。
  const stale = first.state.status === "loading" ? first.state.data : undefined;
  const shown = first.state.status === "ready" ? items : (stale?.items ?? []);

  const loadMore = async () => {
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / PAGE_SIZE) + 1;
      const next = await api.listProducts({ q, categoryId, page: String(page), pageSize: String(PAGE_SIZE) });
      if (mine !== generation.current) return;
      setExtra((previous) => [...previous, ...next.items]);
    } catch (error) {
      if (mine === generation.current) toast(error instanceof Error ? error.message : "加载失败，请重试。");
    } finally {
      if (mine === generation.current) setLoadingMore(false);
    }
  };

  const onBanner = (action: BannerAction) => {
    if (action.kind === "categoryId") {
      scrollAfterFilter(action.id !== categoryId || q !== "");
      setDraft("");
      setFilter({ c: action.id, q: "" });
      return;
    }
    if (action.kind === "category") {
      const match = categoryList.find((c) => action.match.test(c.name));
      if (match) {
        scrollAfterFilter(match.id !== categoryId || q !== "");
        setFilter({ c: match.id, q: "" });
      } else {
        scrollAfterFilter(action.keyword !== q || categoryId !== "");
        setDraft(action.keyword);
        setFilter({ q: action.keyword, c: "" });
      }
      return;
    }
    scrollToList();
  };

  const filtered = q !== "" || categoryId !== "";
  const fits = categoryList.length <= ROW_FIT;
  const iconSize = categoryList.length <= 5 ? 60 : 54;
  const title = q ? `“${q}”的搜索结果` : (currentCategory?.name ?? "推荐商品");

  return (
    <div className="pb-tabbar mx-auto min-h-screen max-w-shell bg-surface">
      {/* 头部：店名（大标题）、电话、购物车 */}
      <header className="flex items-center gap-1 px-5 pb-1 pt-5">
        <h1 className="headline min-w-0 flex-1 truncate text-[30px] font-semibold leading-tight text-ink">{shop?.name ?? " "}</h1>
        {/* 和底部「联系店铺」一样，弹出电话和微信（店主要求，#95） */}
        {shop && (
          <button
            type="button"
            onClick={openContact}
            aria-label="联系店铺"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-page"
          >
            <PhoneIcon size={23} strokeWidth={1.7} />
          </button>
        )}
        <Link
          to="/cart"
          aria-label="购物车"
          className="relative -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-page"
        >
          <CartIcon size={24} strokeWidth={1.7} />
          <CartBadge className="right-0.5 top-1" />
        </Link>
      </header>

      {/* 搜索栏：滚动时吸附在顶部，半透明磨砂 */}
      <div className="glass sticky top-0 z-30 px-5 py-2.5">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            scrollAfterFilter(draft.trim() !== q);
            setFilter({ q: draft });
            (document.activeElement as HTMLElement | null)?.blur();
          }}
          className="flex items-center gap-3"
        >
          <label className="flex h-11 min-w-0 flex-1 items-center rounded-xl bg-page pl-3">
            <SearchIcon size={19} className="shrink-0 text-faint" />
            <span className="sr-only">搜索商品</span>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="搜索商品、品牌或型号"
              maxLength={100}
              className="h-11 min-w-0 flex-1 appearance-none bg-transparent px-2 text-base text-ink placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {draft !== "" && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => {
                  setDraft("");
                  setFilter({ q: "" });
                }}
                className="flex h-11 w-10 shrink-0 items-center justify-center"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-faint/60 text-white">
                  <CloseIcon size={12} strokeWidth={3} />
                </span>
              </button>
            )}
          </label>
          <button type="submit" className="flex min-h-tap shrink-0 items-center text-[17px] font-medium text-brand active:opacity-60">
            搜索
          </button>
        </form>
      </div>

      <div className="space-y-7 px-5 pt-3">
        {!filtered && <BannerCarousel onAction={onBanner} />}

        {/* 分类：不超过 6 个时按数量等分一行、左右对称（店主要求，#82），更多时左右滑动 */}
        {(categoryList.length > 0 || categories.state.status === "loading") && (
          <nav aria-labelledby="category-title">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="category-title" className="headline text-[24px] font-semibold text-ink">
                分类
              </h2>
              <Link to="/categories" className="flex min-h-tap shrink-0 items-center text-[15px] text-brand">
                全部分类
                <ChevronRightIcon size={16} />
              </Link>
            </div>
            <ul className={`flex ${fits ? "" : "no-scrollbar -mx-5 gap-1 overflow-x-auto px-4"}`}>
              {categories.state.status === "loading" &&
                Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="flex flex-1 flex-col items-center gap-2" aria-hidden="true">
                    <span className="skeleton h-[60px] w-[60px] rounded-[18px]" />
                    <span className="skeleton h-3 w-10" />
                  </li>
                ))}
              {categoryList.map((category) => {
                const active = category.id === categoryId;
                return (
                  <li key={category.id} className={fits ? "min-w-0 flex-1" : "w-[72px] shrink-0"}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (!active) scrollAfterFilter(true);
                        setFilter({ c: active ? "" : category.id });
                      }}
                      className="flex w-full flex-col items-center gap-2 active:opacity-60"
                    >
                      <CategoryIcon name={category.name} iconUrl={category.iconUrl} active={active} size={iconSize} />
                      <span className={`max-w-full truncate px-0.5 text-[13px] ${active ? "font-semibold text-brand" : "text-ink"}`}>
                        {category.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {/* 商品列表 */}
        <section ref={listRef} aria-labelledby="list-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="list-title" className="headline min-w-0 truncate text-[24px] font-semibold text-ink">
              {title}
            </h2>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setParams(new URLSearchParams(), { replace: true });
                }}
                className="flex min-h-tap shrink-0 items-center text-[15px] text-brand"
              >
                清除筛选
              </button>
            )}
          </div>

          {first.state.status === "error" ? (
            <div className="mt-3">
              <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
            </div>
          ) : refreshing && stale === undefined ? (
            <div className="grid grid-cols-1 min-[640px]:grid-cols-2 min-[640px]:gap-x-6">
              {Array.from({ length: 4 }, (_, index) => (
                <ProductRowSkeleton key={index} />
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
                    className="mt-4 min-h-tap rounded-full bg-brand px-6 text-base font-medium text-white active:bg-brand-dark"
                  >
                    查看全部商品
                  </button>
                </>
              )}
            </EmptyNotice>
          ) : (
            <>
              {/* 手机上一行一个，屏幕不窄于 640px 时一行两个 */}
              <div className={`grid grid-cols-1 transition-opacity min-[640px]:grid-cols-2 min-[640px]:gap-x-6 ${refreshing ? "opacity-50" : ""}`}>
                {shown.map((product) => (
                  <ProductRow key={product.id} product={product} categoryName={categoryName(product.categoryId)} />
                ))}
              </div>
              {!refreshing && items.length < total && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-5 min-h-tap w-full rounded-full bg-page text-base font-medium text-brand active:opacity-70 disabled:text-faint"
                >
                  {loadingMore ? "正在加载…" : "加载更多"}
                </button>
              )}
              {!refreshing && items.length >= total && <p className="mt-5 text-center text-[13px] text-faint">共 {total} 种商品</p>}
            </>
          )}
        </section>

        <footer className="pb-2 pt-1 text-center text-[12px] leading-relaxed text-faint">
          <p>页面价格为参考价，最终金额以商家联系确认为准</p>
          {shop?.wechatContactText && <p className="whitespace-pre-line break-words">{shop.wechatContactText}</p>}
          <Link to="/privacy" className="mt-1 inline-flex min-h-tap items-center text-[12px] text-muted underline underline-offset-2">
            隐私说明
          </Link>
        </footer>
      </div>

      <TabBar />
    </div>
  );
}
