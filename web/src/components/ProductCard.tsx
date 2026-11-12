import { Link } from "react-router-dom";
import type { ProductListItem } from "../api/index.ts";
import { brandModel } from "../lib/format.ts";
import { Price } from "./Price.tsx";

export function ProductCard({ product }: { product: ProductListItem }) {
  const sub = brandModel(product.brand, product.model);

  return (
    <Link
      to={`/p/${product.id}`}
      className="flex flex-col overflow-hidden rounded-card bg-surface shadow-card active:opacity-80"
    >
      <div className="relative aspect-square bg-white">
        <img
          src={product.mainImage.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-contain ${product.isOutOfStock ? "opacity-50" : ""}`}
        />
        {product.isOutOfStock && (
          <span className="absolute left-2 top-2 rounded-md bg-ink/80 px-2 py-0.5 text-xs font-medium text-white">
            暂时缺货
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-line p-3">
        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-ink">{product.name}</h3>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
        <div className="mt-auto pt-1">
          <Price priceCents={product.priceCents} unit={product.unit} />
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card" aria-hidden="true">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-5 w-2/3" />
      </div>
    </div>
  );
}
