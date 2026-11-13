import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCartCount } from "../lib/cart.ts";
import { openContact } from "./ContactSheet.tsx";
import { toast } from "./Feedback.tsx";
import { CartIcon, GridIcon, HeadsetIcon, HomeIcon } from "./icons.tsx";

/** 购物车数量角标。数量变化时轻跳一下，让客户注意到已经加进去了。 */
export function CartBadge({ className = "" }: { className?: string }) {
  const count = useCartCount();
  const previous = useRef(count);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (count > previous.current) {
      setPop(true);
      const timer = window.setTimeout(() => setPop(false), 320);
      previous.current = count;
      return () => window.clearTimeout(timer);
    }
    previous.current = count;
  }, [count]);
  if (count === 0) return null;
  return (
    <span
      className={`tabular absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white ${pop ? "animate-pop" : ""} ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function openCart() {
  toast("购物车页面将在下一阶段开放");
}

/** 底部导航：首页、分类、购物车、联系店铺。高度留出苹果手机底部横条的安全区。 */
export function TabBar() {
  const { pathname } = useLocation();
  const count = useCartCount();

  const item = (active: boolean) =>
    `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
      active ? "text-brand" : "text-muted"
    }`;

  return (
    <nav
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/95 shadow-bar"
      style={{ backdropFilter: "saturate(180%) blur(12px)", WebkitBackdropFilter: "saturate(180%) blur(12px)" }}
    >
      <div className="pb-safe mx-auto max-w-shell">
        <div className="flex" style={{ height: "var(--tabbar-h)" }}>
          <Link to="/" className={item(pathname === "/")} aria-current={pathname === "/" ? "page" : undefined}>
            <HomeIcon size={24} strokeWidth={pathname === "/" ? 2.3 : 1.8} />
            首页
          </Link>
          <Link
            to="/categories"
            className={item(pathname === "/categories")}
            aria-current={pathname === "/categories" ? "page" : undefined}
          >
            <GridIcon size={24} strokeWidth={pathname === "/categories" ? 2.3 : 1.8} />
            分类
          </Link>
          <button type="button" onClick={openCart} className={item(false)} aria-label={`购物车，已选 ${count} 种商品`}>
            <span className="relative">
              <CartIcon size={24} strokeWidth={1.8} />
              <CartBadge className="-right-2.5 -top-1.5" />
            </span>
            购物车
          </button>
          <button type="button" onClick={openContact} className={item(false)}>
            <HeadsetIcon size={24} strokeWidth={1.8} />
            联系店铺
          </button>
        </div>
      </div>
    </nav>
  );
}
