import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.ts";
import type { AdminProduct, AdminProductQuery, Category } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { brandModel, formatYuan } from "../lib/format.ts";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { CloseIcon, PlusIcon, SearchIcon } from "../components/icons.tsx";
import { Badge } from "./ui.tsx";

// 商品总数在 100 种以内，一页取满 100 条，基本不需要翻页。
const PAGE_SIZE = 100;

type StatusFilter = "all" | "published" | "unpublished" | "outOfStock";

const statusFilters: { key: StatusFilter; label: string; query: Partial<AdminProductQuery> }[] = [
  { key: "all", label: "全部", query: {} },
  { key: "published", label: "上架中", query: { isPublished: "true" } },
  { key: "unpublished", label: "已下架", query: { isPublished: "false" } },
  { key: "outOfStock", label: "缺货", query: { isOutOfStock: "true" } },
];

export function Products() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = (statusFilters.find((f) => f.key === params.get("s"))?.key ?? "all") as StatusFilter;

  const setFilter = (next: { q?: string; s?: StatusFilter }) => {
    const merged = { q, s: status, ...next };
    const search = new URLSearchParams();
    if (merged.q.trim()) search.set("q", merged.q.trim());
    if (merged.s !== "all") search.set("s", merged.s);
    setParams(search, { replace: true });
  };

  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft.trim() === q) return;
    const timer = window.setTimeout(() => setFilter({ q: draft }), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const categories = useAsync(() => api.listAdminCategories(), []);
  const categoryName = (id: string) =>
    categories.state.status === "ready"
      ? (categories.state.data.items.find((c: Category) => c.id === id)?.name ?? "")
      : "";
  const noCategory = categories.state.status === "ready" && categories.state.data.items.length === 0;

  const [extra, setExtra] = useState<AdminProduct[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterQuery = statusFilters.find((f) => f.key === status)!.query;
  const first = useAsync(() => {
    setExtra([]);
    return api.listAdminProducts({ q, ...filterQuery, page: "1", pageSize: String(PAGE_SIZE) });
  }, [q, status]);

  const items = first.state.status === "ready" ? [...first.state.data.items, ...extra] : [];
  const total = first.state.status === "ready" ? first.state.data.total : 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = Math.floor(items.length / PAGE_SIZE) + 1;
      const next = await api.listAdminProducts({ q, ...filterQuery, page: String(page), pageSize: String(PAGE_SIZE) });
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
          <span className="sr-only">搜索商品</span>
          <SearchIcon size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            enterKeyHint="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="搜索商品名、品牌或型号"
            maxLength={100}
            className="h-12 w-full appearance-none rounded-control border border-line bg-surface pl-10 pr-10 text-base placeholder:text-faint focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {draft !== "" && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => {
                setDraft("");
                setFilter({ q: "" });
              }}
              className="absolute right-0 top-0 flex h-12 w-10 items-center justify-center text-faint"
            >
              <CloseIcon size={18} />
            </button>
          )}
        </label>
        <Link
          to="/admin/products/new"
          className="flex h-12 shrink-0 items-center gap-1 rounded-control bg-brand px-4 text-base font-medium text-white active:bg-brand-dark"
        >
          <PlusIcon size={20} />
          新增
        </Link>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="按状态筛选">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={status === filter.key}
            onClick={() => setFilter({ s: filter.key })}
            className={`min-h-[40px] shrink-0 rounded-full px-4 text-[15px] font-medium ${
              status === filter.key ? "bg-brand text-white" : "border border-line bg-surface text-ink"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {noCategory && (
        <p className="mt-4 rounded-control bg-brand-soft px-3 py-2.5 text-[15px] text-brand">
          还没有分类。请先到「分类」里添加至少一个分类，再新增商品。
        </p>
      )}

      <div className="mt-4">
        {first.state.status === "error" ? (
          <ErrorNotice message={first.state.error.message} onRetry={first.retry} />
        ) : first.state.status === "loading" && items.length === 0 ? (
          <p className="py-10 text-center text-muted">正在加载…</p>
        ) : items.length === 0 ? (
          <EmptyNotice title={q || status !== "all" ? "没有符合条件的商品" : "还没有商品"}>
            {!q && status === "all" && <p>点右上角「新增」添加第一件商品。</p>}
          </EmptyNotice>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">共 {total} 种</p>
            <ul className="space-y-2">
              {items.map((product) => (
                <li key={product.id}>
                  <ProductRow product={product} categoryName={categoryName(product.categoryId)} />
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

function ProductRow({ product, categoryName }: { product: AdminProduct; categoryName: string }) {
  const sub = brandModel(product.brand, product.model);
  return (
    <Link
      to={`/admin/products/${product.id}`}
      className="flex gap-3 rounded-card bg-surface p-3 shadow-card active:opacity-80"
    >
      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border border-line bg-white">
        {product.mainImage ? (
          <img
            src={product.mainImage.thumbnailUrl}
            alt=""
            loading="lazy"
            className={`h-full w-full object-contain ${product.isPublished ? "" : "opacity-50"}`}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-faint">无主图</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`line-clamp-2 text-[15px] font-medium leading-snug ${product.isPublished ? "text-ink" : "text-muted"}`}>
          {product.name}
        </p>
        {(sub || categoryName) && (
          <p className="mt-0.5 truncate text-xs text-muted">{[categoryName, sub].filter(Boolean).join(" ｜ ")}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="tabular text-[15px] font-semibold text-ink">
            {product.priceCents === null ? "面议" : `¥${formatYuan(product.priceCents)}`}
            <span className="text-xs font-normal text-muted">/{product.unit}</span>
          </span>
          {product.isPublished ? <Badge tone="blue">上架中</Badge> : <Badge tone="gray">已下架</Badge>}
          {product.isOutOfStock && <Badge tone="amber">缺货</Badge>}
          {product.isPinned && <Badge tone="blue">置顶</Badge>}
        </div>
      </div>
    </Link>
  );
}
