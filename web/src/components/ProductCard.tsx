import { Link } from "react-router-dom";
import type { ProductListItem } from "../api/index.ts";
import { addToCart } from "../lib/cart.ts";
import { brandModel } from "../lib/format.ts";
import { toast } from "./Feedback.tsx";
import { Price } from "./Price.tsx";
import { CartPlusIcon } from "./icons.tsx";

export function ProductCard({ product }: { product: ProductListItem }) {
  const sub = brandModel(product.brand, product.model);
  const soldOut = product.isOutOfStock;

  return (
    // 链接和「加入购物车」按钮是兄弟元素：按钮不能嵌在链接里。
    <div className="relative flex flex-col overflow-hidden rounded-card bg-surface shadow-card">
      <Link to={`/p/${product.id}`} className="flex flex-1 flex-col active:opacity-80">
        <div className="ratio-square bg-white">
          <img
            src={product.mainImage.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={`object-contain p-2 ${soldOut ? "opacity-45 grayscale" : ""}`}
          />
        </div>
        {soldOut && (
          <span className="absolute left-2 top-2 rounded-md bg-ink/75 px-2 py-0.5 text-xs font-medium text-white">暂时缺货</span>
        )}
        <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{product.name}</h3>
          {sub && <p className="mt-1 truncate text-[12px] text-muted">{sub}</p>}
          {/* 右侧给购物车按钮留位置 */}
          <div className="mt-auto pr-10 pt-2">
            <Price priceCents={product.priceCents} unit={product.unit} />
          </div>
        </div>
      </Link>
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
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent-gradient text-white shadow-accent group-active:scale-90 group-disabled:bg-none group-disabled:bg-line group-disabled:text-faint group-disabled:shadow-none">
          <CartPlusIcon size={19} strokeWidth={2.1} />
        </span>
      </button>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card" aria-hidden="true">
      <div className="ratio-square">
        <div className="ratio-fill skeleton rounded-none" />
      </div>
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-5 w-2/3" />
      </div>
    </div>
  );
}
