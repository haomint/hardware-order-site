import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useShop } from "../lib/shop.tsx";
import { useWhitePage } from "../lib/useWhitePage.ts";
import { CategoryIcon } from "../components/Art.tsx";
import { EmptyNotice, ErrorNotice } from "../components/Feedback.tsx";
import { ChevronRightIcon } from "../components/icons.tsx";
import { TabBar } from "../components/TabBar.tsx";

/**
 * 分类页（苹果风格，#84）：白底大标题 + 列表。每行是图标、分类名和箭头，细线分隔，
 * 分类有几个都排得整齐；点击进入首页并按该分类筛选。
 */
export function Categories() {
  const shop = useShop();
  useWhitePage();
  const { state, retry } = useAsync(() => api.listCategories(), []);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (shop?.name) document.title = `商品分类 - ${shop.name}`;
  }, [shop?.name]);

  return (
    <div className="pb-tabbar mx-auto min-h-screen max-w-shell bg-surface">
      <header className="px-5 pb-2 pt-5">
        <h1 className="headline text-[30px] font-semibold leading-tight text-ink">分类</h1>
        <p className="mt-1 text-[15px] text-muted">选一个分类，查看该类全部商品</p>
      </header>

      <main className="px-5 pt-2">
        {state.status === "error" ? (
          <ErrorNotice message={state.error.message} onRetry={retry} />
        ) : state.status === "loading" ? (
          <ul aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 border-b border-line py-3">
                <span className="skeleton h-14 w-14 rounded-[30%]" />
                <span className="skeleton h-4 w-24" />
              </li>
            ))}
          </ul>
        ) : state.data.items.length === 0 ? (
          <EmptyNotice title="店铺还没有上架商品" />
        ) : (
          <ul>
            {state.data.items.map((category) => (
              <li key={category.id} className="border-b border-line last:border-b-0">
                <Link to={`/?c=${encodeURIComponent(category.id)}`} className="flex items-center gap-4 py-3 active:opacity-60">
                  <CategoryIcon name={category.name} size={56} />
                  <span className="min-w-0 flex-1 break-words text-[17px] text-ink">{category.name}</span>
                  <ChevronRightIcon size={18} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <TabBar />
    </div>
  );
}
