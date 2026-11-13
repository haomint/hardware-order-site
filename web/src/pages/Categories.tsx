import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/index.ts";
import { useAsync } from "../lib/useAsync.ts";
import { useShop } from "../lib/shop.tsx";
import { CategoryIcon } from "../components/Art.tsx";
import { EmptyNotice, ErrorNotice } from "../components/Feedback.tsx";
import { TabBar } from "../components/TabBar.tsx";

/** 分类页：全部分类的图标宫格，点击进入首页并按该分类筛选。 */
export function Categories() {
  const shop = useShop();
  const { state, retry } = useAsync(() => api.listCategories(), []);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (shop?.name) document.title = `商品分类 - ${shop.name}`;
  }, [shop?.name]);

  return (
    <div className="pb-tabbar mx-auto min-h-screen max-w-shell">
      <header className="sticky top-0 z-30 bg-page/95 px-4 pb-3 pt-4">
        <h1 className="text-[22px] font-extrabold text-ink">商品分类</h1>
        <p className="mt-0.5 text-[13px] text-muted">点击分类查看该类全部商品</p>
      </header>

      <main className="px-4">
        {state.status === "error" ? (
          <ErrorNotice message={state.error.message} onRetry={retry} />
        ) : state.status === "loading" ? (
          <div className="grid grid-cols-3 gap-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 rounded-card bg-surface py-5 shadow-card">
                <span className="skeleton h-16 w-16 rounded-2xl" />
                <span className="skeleton h-3.5 w-14" />
              </div>
            ))}
          </div>
        ) : state.data.items.length === 0 ? (
          <EmptyNotice title="店铺还没有上架商品" />
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {state.data.items.map((category) => (
              <li key={category.id}>
                <Link
                  to={`/?c=${encodeURIComponent(category.id)}`}
                  className="flex h-full flex-col items-center gap-2 rounded-card bg-surface px-2 py-5 shadow-card active:scale-[0.97] active:bg-brand-soft"
                >
                  <CategoryIcon name={category.name} size={64} />
                  <span className="max-w-full break-words text-center text-[15px] font-semibold leading-snug text-ink">
                    {category.name}
                  </span>
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
