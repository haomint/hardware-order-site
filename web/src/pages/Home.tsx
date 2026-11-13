import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { Category, ProductListItem } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { ProductRow, ProductRowSkeleton } from "../components/ProductCard.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { BannerCarousel, ServiceStrip } from "../components/BannerCarousel.tsx";
import type { BannerAction } from "../components/BannerCarousel.tsx";
import { CategoryIcon } from "../components/Art.tsx";
import { CartBadge, TabBar } from "../components/TabBar.tsx";
import { CartIcon, ChevronRightIcon, CloseIcon, PhoneIcon, SearchIcon } from "../components/icons.tsx";

const PAGE_SIZE = 20;
/** 分类不超过这个数时平均排满一行，超过时可左右滑动。 */
const ROW_FIT = 6;

export function Home() {
  const shop = useShop();
  const listRef = useRef<HTMLElement>(null);

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
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
  };

  const categories = useAsync(() => api.listCategories(), []);
  const categoryList: Category[] = categories.state.status === "ready" ? categories.state.data.items : [];
  const categoryName = (id: string) => categoryList.find((c) => c.id === id)?.name;
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

  const onBanner = (action: BannerAction) => {
    if (action.kind === "category") {
      const match = categoryList.find((c) => action.match.test(c.name));
      if (match) setFilter({ c: match.id, q: "" });
      else {
        setDraft(action.keyword);
        setFilter({ q: action.keyword, c: "" });
      }
    }
    window.setTimeout(scrollToList, 60);
  };

  const filtered = q !== "" || categoryId !== "";
  const fits = categoryList.length <= ROW_FIT;
  const iconSize = categoryList.length <= 5 ? 52 : 46;
  const title = q ? `“${q}”的搜索结果` : (currentCategory?.name ?? "推荐商品");

  return (
    <div className="pb-tabbar mx-auto min-h-screen max-w-shell">
      {/* 头部：店名、电话、购物车 */}
      <header className="bg-gradient-to-b from-white to-page px-4 pb-1 pt-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-brand">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M21.7 6.3a5.5 5.5 0 0 1-7.4 6.8l-7.9 7.9a2.1 2.1 0 0 1-3-3l7.9-7.9a5.5 5.5 0 0 1 6.8-7.4l-3.3 3.3.6 2.9 2.9.6z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[21px] font-black leading-tight text-[#13306f]">{shop?.name ?? " "}</h1>
            <p className="truncate text-[12px] text-muted">线上选货 · 店家确认</p>
          </div>
          {shop?.phone && (
            <a
              href={`tel:${shop.phone}`}
              aria-label={`拨打店铺电话 ${shop.phone}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-brand-soft"
            >
              <PhoneIcon size={23} />
            </a>
          )}
          <Link
            to="/cart"
            aria-label="购物车"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-brand-soft"
          >
            <CartIcon size={25} />
            <CartBadge className="right-0 top-0.5" />
          </Link>
        </div>
      </header>

      {/* 搜索栏：滚动时吸附在顶部 */}
      <div className="sticky top-0 z-30 bg-page/95 px-4 pb-3 pt-2.5">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ q: draft });
            (document.activeElement as HTMLElement | null)?.blur();
            scrollToList();
          }}
          className="flex h-[52px] items-center rounded-full border-2 border-brand bg-surface pl-4 pr-1 focus-within:shadow-brand"
        >
          <SearchIcon size={21} className="shrink-0 text-muted" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">搜索商品</span>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="搜索五金商品"
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
          <button type="submit" className="bg-accent-gradient h-11 shrink-0 rounded-full px-6 text-[16px] font-bold text-white shadow-accent">
            搜索
          </button>
        </form>
      </div>

      <div className="space-y-3 px-4">
        {!filtered && (
          <>
            <BannerCarousel onAction={onBanner} />
            <ServiceStrip />
          </>
        )}

        {/* 分类：不超过 6 个时排满一行，更多时左右滑动 */}
        {(categoryList.length > 0 || categories.state.status === "loading") && (
          <nav aria-label="商品分类" className="rounded-[20px] bg-surface py-4 shadow-card">
            <ul className={`flex ${fits ? "px-1" : "no-scrollbar gap-1 overflow-x-auto px-2"}`}>
              {categories.state.status === "loading" &&
                Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="flex flex-1 flex-col items-center gap-2" aria-hidden="true">
                    <span className="skeleton h-[52px] w-[52px] rounded-2xl" />
                    <span className="skeleton h-3 w-10" />
                  </li>
                ))}
              {categoryList.map((category) => {
                const active = category.id === categoryId;
                return (
                  <li key={category.id} className={fits ? "min-w-0 flex-1" : "w-[68px] shrink-0"}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setFilter({ c: active ? "" : category.id });
                        if (!active) window.setTimeout(scrollToList, 60);
                      }}
                      className="flex w-full flex-col items-center gap-1.5 active:opacity-70"
                    >
                      <CategoryIcon name={category.name} active={active} size={iconSize} />
                      <span className={`max-w-full truncate px-0.5 text-[13px] ${active ? "font-bold text-brand" : "font-medium text-ink"}`}>
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
        <section ref={listRef} aria-labelledby="list-title" className="pt-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="list-title" className="flex min-w-0 items-center gap-2 text-[19px] font-black text-ink">
              <span className="h-5 w-[5px] shrink-0 rounded-full bg-accent-gradient" aria-hidden="true" />
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
              <Link to="/categories" className="flex min-h-tap shrink-0 items-center text-[14px] text-muted">
                全部分类
                <ChevronRightIcon size={16} />
              </Link>
            )}
          </div>

          {first.state.status === "error" ? (
            <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
          ) : refreshing && stale === undefined ? (
            <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
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
                    className="mt-4 min-h-tap rounded-full border border-brand px-6 text-base font-medium text-brand active:bg-brand-soft"
                  >
                    查看全部商品
                  </button>
                </>
              )}
            </EmptyNotice>
          ) : (
            <>
              {/* 手机上每行一张卡片，屏幕宽于 440px 时每行两张 */}
              <div className={`grid grid-cols-1 gap-3 transition-opacity min-[440px]:grid-cols-2 ${refreshing ? "opacity-50" : ""}`}>
                {shown.map((product) => (
                  <ProductRow key={product.id} product={product} categoryName={categoryName(product.categoryId)} />
                ))}
              </div>
              {!refreshing && items.length < total && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 min-h-tap w-full rounded-full border border-line bg-surface text-base font-medium text-brand active:bg-brand-soft disabled:text-faint"
                >
                  {loadingMore ? "正在加载…" : "加载更多"}
                </button>
              )}
              {!refreshing && items.length >= total && (
                <p className="mt-5 text-center text-[13px] text-faint">— 共 {total} 种商品 —</p>
              )}
            </>
          )}
        </section>

        <footer className="pt-2 text-center text-[13px] leading-relaxed text-faint">
          <p>页面价格为参考价，最终金额以商家联系确认为准</p>
          {shop?.wechatContactText && <p>{shop.wechatContactText}</p>}
          <Link to="/privacy" className="mt-1 inline-flex min-h-tap items-center text-[13px] text-muted underline underline-offset-2">
            隐私说明
          </Link>
        </footer>
      </div>

      <TabBar />
    </div>
  );
}
