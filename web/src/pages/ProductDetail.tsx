import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { ProductDetail as Product } from "../api/index.ts";
import { addToCart, MAX_QUANTITY, useCartCount } from "../lib/cart.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { Price } from "../components/Price.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { BackIcon, CartIcon, MinusIcon, PhoneIcon, PlusIcon } from "../components/icons.tsx";

export function ProductDetail() {
  const { id = "" } = useParams();
  const { state, retry } = useAsync(() => api.getProduct(id), [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <div className="mx-auto min-h-screen max-w-shell bg-page pb-28">
      <TopBar />
      {state.status === "loading" && <DetailSkeleton />}
      {state.status === "error" &&
        (state.error instanceof ApiError && state.error.code === "PRODUCT_NOT_FOUND" ? (
          <EmptyNotice title="这件商品已下架或不存在">
            <Link
              to="/"
              className="mt-4 inline-flex min-h-tap items-center rounded-control bg-brand px-6 text-base font-medium text-white"
            >
              看看其他商品
            </Link>
          </EmptyNotice>
        ) : (
          <ErrorNotice message={state.error.message} onRetry={retry} />
        ))}
      {state.status === "ready" && <DetailBody product={state.data} />}
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const cartCount = useCartCount();
  // 从列表点进来时返回上一页（保留筛选和滚动位置）；直接打开分享链接时回到首页。
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/"));

  return (
    <div className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-surface/95 px-1 backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        className="flex min-h-tap items-center gap-0.5 pl-2 pr-3 text-base text-ink active:opacity-60"
      >
        <BackIcon />
        返回
      </button>
      <button
        type="button"
        onClick={() => toast("购物车将在下一阶段开放")}
        aria-label={`购物车，已选 ${cartCount} 种商品`}
        className="relative mr-2 flex min-h-tap min-w-tap items-center justify-center text-ink active:opacity-60"
      >
        <CartIcon />
        {cartCount > 0 && (
          <span className="tabular absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-white">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>
    </div>
  );
}

function DetailBody({ product }: { product: Product }) {
  const shop = useShop();
  const images = [product.mainImage, ...product.detailImages];
  const facts = [
    { label: "品牌", value: product.brand },
    { label: "型号", value: product.model },
    { label: "单位", value: product.unit },
  ].filter((fact) => fact.value.trim() !== "");

  return (
    <>
      <Gallery images={images.map((image) => image.imageUrl)} dimmed={product.isOutOfStock} />

      <section className="bg-surface px-4 pb-5 pt-4">
        <h1 className="text-xl font-bold leading-snug text-ink">{product.name}</h1>
        <div className="mt-3">
          <Price priceCents={product.priceCents} unit={product.unit} size="detail" />
        </div>
        <p className="mt-2 text-sm text-muted">
          {product.priceCents === null
            ? "此商品价格需与店家确认，可先加入订货单。"
            : "最终金额以商家联系确认为准，暂不含运费。"}
        </p>
        {product.isOutOfStock && (
          <p className="mt-3 rounded-control bg-brand-soft px-3 py-2.5 text-[15px] font-medium text-brand">
            暂时缺货，如有需要请联系店铺询问到货时间。
          </p>
        )}
      </section>

      <section className="mt-2 bg-surface px-4 py-4">
        <dl className="divide-y divide-line">
          {facts.map((fact) => (
            <div key={fact.label} className="flex gap-4 py-2.5 text-base">
              <dt className="w-12 shrink-0 text-muted">{fact.label}</dt>
              <dd className="min-w-0 break-words text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-2 bg-surface px-4 py-4">
        <h2 className="text-base font-bold text-ink">性能参数</h2>
        <p className="mt-2 whitespace-pre-line break-words text-base leading-relaxed text-ink">
          {product.specifications}
        </p>
      </section>

      {product.isOutOfStock ? <ContactBar phone={shop?.phone ?? ""} /> : <OrderBar product={product} />}
    </>
  );
}

/** 图片轮播：左右滑动切换，底部显示当前第几张。 */
function Gallery({ images, dimmed }: { images: string[]; dimmed: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative bg-white">
      <div
        ref={track}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        aria-label="商品图片，可左右滑动"
      >
        {images.map((src, i) => (
          <div key={src + i} className="aspect-square w-full shrink-0 snap-center">
            <img
              src={src}
              alt={`商品图片 ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`h-full w-full object-contain ${dimmed ? "opacity-60" : ""}`}
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <span className="tabular absolute bottom-3 right-3 rounded-full bg-ink/60 px-2.5 py-0.5 text-sm text-white">
          {Math.min(index + 1, images.length)} / {images.length}
        </span>
      )}
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface shadow-bar">
      <div className="pb-safe mx-auto max-w-shell">
        <div className="flex items-center gap-3 px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function OrderBar({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const clamp = (value: number) => Math.max(1, Math.min(MAX_QUANTITY, value));

  return (
    <BottomBar>
      <div className="flex h-12 shrink-0 items-center rounded-control border border-line">
        <button
          type="button"
          aria-label="减少数量"
          disabled={quantity <= 1}
          onClick={() => setQuantity((n) => clamp(n - 1))}
          className="flex h-12 w-11 items-center justify-center text-ink active:bg-brand-soft disabled:text-faint/60"
        >
          <MinusIcon size={20} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="数量"
          value={quantity}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            setQuantity(digits === "" ? 1 : clamp(Number(digits)));
          }}
          onFocus={(event) => event.target.select()}
          className="tabular h-12 w-12 border-x border-line bg-transparent text-center text-lg font-medium focus:outline-none"
        />
        <button
          type="button"
          aria-label="增加数量"
          disabled={quantity >= MAX_QUANTITY}
          onClick={() => setQuantity((n) => clamp(n + 1))}
          className="flex h-12 w-11 items-center justify-center text-ink active:bg-brand-soft disabled:text-faint/60"
        >
          <PlusIcon size={20} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          addToCart(product.id, quantity);
          toast(`已加入购物车：${quantity} ${product.unit}`);
          setQuantity(1);
        }}
        className="h-12 min-w-0 flex-1 rounded-control bg-accent text-lg font-bold text-white active:bg-accent-dark"
      >
        加入购物车
      </button>
    </BottomBar>
  );
}

function ContactBar({ phone }: { phone: string }) {
  return (
    <BottomBar>
      <p className="min-w-0 flex-1 text-base font-medium text-muted">暂时缺货</p>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex h-12 items-center gap-2 rounded-control bg-brand px-6 text-lg font-bold text-white active:bg-brand-dark"
        >
          <PhoneIcon size={20} />
          联系店铺
        </a>
      )}
    </BottomBar>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-3 bg-surface px-4 py-4">
        <div className="skeleton h-6 w-4/5" />
        <div className="skeleton h-8 w-2/5" />
        <div className="skeleton h-4 w-3/5" />
      </div>
    </div>
  );
}
