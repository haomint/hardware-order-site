import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { usingMock } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { useAdminSession } from "./session.tsx";

export function AdminLayout() {
  const shop = useShop();
  const { session, logout } = useAdminSession();

  useEffect(() => {
    document.title = "店铺后台";
  }, []);

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-[40px] flex-1 items-center justify-center rounded-[10px] text-[15px] ${
      isActive ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-muted active:opacity-60"
    }`;

  return (
    <div className="mx-auto min-h-screen max-w-shell bg-page pb-10">
      <header className="glass sticky top-0 z-30 [box-shadow:0_0.5px_0_rgba(0,0,0,0.12)]">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <p className="min-w-0 truncate text-[17px] font-semibold text-ink">{shop?.name ?? "店铺"} · 后台</p>
          <div className="flex shrink-0 items-center gap-1">
            <a href="/" target="_blank" rel="noopener" className="flex min-h-tap items-center px-2 text-[15px] text-brand">
              看商城
            </a>
            <button
              type="button"
              onClick={logout}
              className="flex min-h-tap items-center px-2 text-[15px] text-muted"
              aria-label={`退出登录（${session.username}）`}
            >
              退出
            </button>
          </div>
        </div>
        <nav className="mx-4 mb-2 flex gap-0.5 rounded-xl bg-[#ececf0] p-1" aria-label="后台导航">
          <NavLink to="/admin/orders" className={tab}>
            订单
          </NavLink>
          <NavLink to="/admin/products" className={tab}>
            商品
          </NavLink>
          <NavLink to="/admin/categories" className={tab}>
            分类
          </NavLink>
          <NavLink to="/admin/banners" className={tab}>
            轮播
          </NavLink>
          <NavLink to="/admin/shop" className={tab}>
            店铺
          </NavLink>
        </nav>
      </header>

      {usingMock && (
        <p className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          演示数据：修改只保存在本页面，刷新后恢复原样。
        </p>
      )}

      <main className="px-4 pt-4">
        <Outlet />
      </main>
    </div>
  );
}
