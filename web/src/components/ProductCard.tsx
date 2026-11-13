import { Link } from "react-router-dom";
import type { ProductListItem } from "../api/index.ts";
import { addToCart } from "../lib/cart.ts";
import { brandModel } from "../lib/format.ts";
import { toast } from "./Feedback.tsx";
import { Price } from "./Price.tsx";
import { CartPlusIcon } from "./icons.tsx";

function AddButton({ product }: { product: ProductListItem }) {
  const soldOut = product.isOutOfStock;
  return (
    <button
      type="button"
      disabled={soldOut}
      aria-label={soldOut ? `${product.name}暂时缺货` : `把${product.name}加入购物车`}
      onClick={() => {
        addToCart(product.id, 1);
        toast(`已加入购物车：${product.name.length > 12 ? product.name.slice(0, 12) + "…" : product.name}`);
      }}
      // 可点击区域 44px，看到的圆形按钮 34px。
      className="group absolute bottom-1.5 right-1.5 flex h-11 w-11 items-center justify-center disabled:cursor-not-allowed"
    >
      <span className="bg-accent-gradient flex h-[34px] w-[34px] items-center justify-center rounded-full text-white shadow-accent group-active:scale-90 group-disabled:bg-none group-disabled:bg-line group-disabled:text-faint group-disabled:shadow-none">
        <CartPlusIcon size={19} strokeWidth={2.1} />
      </span>
    </button>
  );
}

/** 左图右文的商品卡片（首页列表用）。 */
export function ProductRow({ product, categoryName }: { product: ProductListItem; categoryName?: string }) {
  const sub = brandModel(product.brand, product.model);
  const soldOut = product.isOutOfStock;
  const meta = [categoryName, `按${product.unit}计价`].filter(Boolean).join(" · ");

  return (
    // 链接和「加入购物车」按钮是兄弟元素：按钮不能嵌在链接里。
    <div className="relative rounded-card bg-surface shadow-card">
      <Link to={`/p/${product.id}`} className="flex gap-3 p-2.5 active:opacity-80">
        {/* 固定宽高，旧版 iOS 上也是正方形 */}
        <div className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-white">
          <img
            src={product.mainImage.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-contain ${soldOut ? "opacity-45 grayscale" : ""}`}
          />
          {soldOut && (
            <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-xl bg-ink/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
              暂时缺货
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-0.5">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{product.name}</h3>
          {sub && <p className="mt-1 truncate text-[13px] text-muted">{sub}</p>}
          <p className="mt-0.5 truncate text-[12px] text-faint">{meta}</p>
          {/* 右侧给购物车按钮留位置 */}
          <div className="mt-auto pr-11 pt-1">
            <Price priceCents={product.priceCents} unit={product.unit} />
          </div>
        </div>
      </Link>
      <AddButton product={product} />
    </div>
  );
}

export function ProductRowSkeleton() {
  return (
    <div className="flex gap-3 rounded-card bg-surface p-2.5 shadow-card" aria-hidden="true">
      <div className="skeleton h-[104px] w-[104px] shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton mt-6 h-5 w-1/3" />
      </div>
    </div>
  );
}
