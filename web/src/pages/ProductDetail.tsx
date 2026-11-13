import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { ProductDetail as Product } from "../api/index.ts";
import { addToCart, MAX_QUANTITY } from "../lib/cart.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { Price } from "../components/Price.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { openContact } from "../components/ContactSheet.tsx";
import { CartBadge, openCart } from "../components/TabBar.tsx";
import { BackIcon, CartIcon, HeadsetIcon, HomeIcon, MinusIcon, PlusIcon } from "../components/icons.tsx";

export function ProductDetail() {
  const { id = "" } = useParams();
  const { state, retry } = useAsync(() => api.getProduct(id), [id]);
  const shop = useShop();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (state.status === "ready" && shop?.name) document.title = `${state.data.name} - ${shop.name}`;
  }, [state, shop?.name]);

  return (
    <div className="mx-auto min-h-screen max-w-shell bg-page" style={{ paddingBottom: "calc(76px + var(--safe-bottom))" }}>
      <FloatingTopBar />
      {state.status === "loading" && <DetailSkeleton />}
      {state.status === "error" && (
        <div className="pt-16">
          {state.error instanceof ApiError && state.error.code === "PRODUCT_NOT_FOUND" ? (
            <EmptyNotice title="这件商品已下架或不存在">
              <Link
                to="/"
                className="bg-brand-gradient mt-4 inline-flex min-h-tap items-center rounded-full px-6 text-base font-medium text-white"
              >
                看看其他商品
              </Link>
            </EmptyNotice>
          ) : (
            <ErrorNotice message={state.error.message} onRetry={retry} />
          )}
        </div>
      )}
      {state.status === "ready" && <DetailBody product={state.data} />}
    </div>
  );
}

/** 浮在图片上方的返回和购物车按钮。 */
function FloatingTopBar() {
  const navigate = useNavigate();
  // 从列表点进来时返回上一页（保留筛选和滚动位置）；直接打开分享链接时回到首页。
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/"));
  const circle =
    "flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-card active:bg-white";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
      <div className="pt-safe mx-auto flex max-w-shell items-center justify-between px-3 pt-3">
        <button type="button" onClick={goBack} aria-label="返回" className={`pointer-events-auto ${circle}`}>
          <BackIcon size={22} />
        </button>
        <button type="button" onClick={openCart} aria-label="购物车" className={`pointer-events-auto relative ${circle}`}>
          <CartIcon size={21} />
          <CartBadge className="-right-1 -top-1" />
        </button>
      </div>
    </div>
  );
}

function DetailBody({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const images = [product.mainImage, ...product.detailImages];
  const facts = [
    { label: "品牌", value: product.brand },
    { label: "型号", value: product.model },
    { label: "单位", value: product.unit },
  ].filter((fact) => fact.value.trim() !== "");

  return (
    <>
      <Gallery images={images.map((image) => image.imageUrl)} dimmed={product.isOutOfStock} />

      {/* 信息卡片：上沿圆角压在图片上 */}
      <section className="relative -mt-5 rounded-t-[22px] bg-surface px-4 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <Price priceCents={product.priceCents} unit={product.unit} size="detail" />
          {product.isOutOfStock && (
            <span className="mt-1 shrink-0 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-medium text-white">暂时缺货</span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-faint">
          {product.priceCents === null ? "价格需与店家确认，可先加入订货单" : "参考价，最终金额以商家联系确认为准，暂不含运费"}
        </p>
        <h1 className="mt-3 text-[19px] font-bold leading-snug text-ink">{product.name}</h1>

        {facts.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-2">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-center gap-1.5 rounded-lg bg-page px-2.5 py-1.5 text-[13px]">
                <dt className="text-muted">{fact.label}</dt>
                <dd className="font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {product.isOutOfStock ? (
          <p className="mt-4 rounded-xl bg-brand-soft px-3.5 py-3 text-[15px] font-medium text-brand">
            暂时缺货，如有需要请联系店铺询问到货时间。
          </p>
        ) : (
          <QuantityRow quantity={quantity} unit={product.unit} onChange={setQuantity} />
        )}
      </section>

      <Card title="性能参数">
        <p className="whitespace-pre-line break-words text-[15px] leading-[1.8] text-ink">{product.specifications}</p>
      </Card>

      <Card title="订货说明">
        <ol className="space-y-2 text-[14px] leading-relaxed text-muted">
          <li>1. 选好商品加入购物车，提交订货单，无需注册和付款。</li>
          <li>2. 店家会电话或微信联系您，确认价格、运费和配送方式。</li>
          <li>3. 确认后线下付款，店家送货或您到店自提。</li>
        </ol>
      </Card>

      <BottomBar>
        <IconAction to="/" label="首页" icon={<HomeIcon size={22} strokeWidth={1.8} />} />
        <IconAction onClick={openContact} label="联系" icon={<HeadsetIcon size={22} strokeWidth={1.8} />} />
        <IconAction
          onClick={openCart}
          label="购物车"
          icon={
            <span className="relative">
              <CartIcon size={22} strokeWidth={1.8} />
              <CartBadge className="-right-2.5 -top-1.5" />
            </span>
          }
        />
        {product.isOutOfStock ? (
          <button
            type="button"
            onClick={openContact}
            className="bg-brand-gradient ml-1 h-12 min-w-0 flex-1 rounded-full text-[16px] font-bold text-white shadow-brand active:opacity-90"
          >
            缺货 · 联系店铺
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              addToCart(product.id, quantity);
              toast(`已加入购物车：${quantity} ${product.unit}`);
              setQuantity(1);
            }}
            className="bg-accent-gradient ml-1 h-12 min-w-0 flex-1 rounded-full text-[17px] font-bold text-white shadow-accent"
          >
            加入购物车
          </button>
        )}
      </BottomBar>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-2.5 bg-surface px-4 py-4">
      <h2 className="mb-2.5 flex items-center gap-2 text-[16px] font-bold text-ink">
        <span className="h-4 w-1 rounded-full bg-accent-gradient" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// onChange 接收「根据当前数量算出新数量」的函数，快速连点时每次都基于最新数量。
function QuantityRow({
  quantity,
  unit,
  onChange,
}: {
  quantity: number;
  unit: string;
  onChange: (update: (current: number) => number) => void;
}) {
  const clamp = (value: number) => Math.max(1, Math.min(MAX_QUANTITY, value));
  const step = "flex h-11 w-11 items-center justify-center text-ink active:bg-page disabled:text-faint/60";
  return (
    <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
      <span className="text-[15px] text-ink">
        购买数量<span className="ml-1 text-[13px] text-faint">（{unit}）</span>
      </span>
      <div className="flex h-11 items-center overflow-hidden rounded-full border border-line">
        <button type="button" aria-label="减少数量" disabled={quantity <= 1} onClick={() => onChange((n) => clamp(n - 1))} className={step}>
          <MinusIcon size={18} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="数量"
          value={quantity}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            onChange(() => (digits === "" ? 1 : clamp(Number(digits))));
          }}
          onFocus={(event) => event.target.select()}
          className="tabular h-11 w-14 border-x border-line bg-transparent text-center text-[17px] font-semibold focus:outline-none"
        />
        <button
          type="button"
          aria-label="增加数量"
          disabled={quantity >= MAX_QUANTITY}
          onClick={() => onChange((n) => clamp(n + 1))}
          className={step}
        >
          <PlusIcon size={18} />
        </button>
      </div>
    </div>
  );
}

function IconAction({ label, icon, to, onClick }: { label: string; icon: ReactNode; to?: string; onClick?: () => void }) {
  const className = "flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] text-muted active:text-brand";
  return to ? (
    <Link to={to} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
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
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        aria-label="商品图片，可左右滑动"
      >
        {images.map((src, i) => (
          <div key={src + i} className="w-full shrink-0 snap-center">
            <div className="ratio-square">
              <img
                src={src}
                alt={`商品图片 ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className={`object-contain ${dimmed ? "opacity-55 grayscale" : ""}`}
              />
            </div>
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <span className="tabular absolute bottom-8 right-4 rounded-full bg-ink/55 px-2.5 py-0.5 text-[13px] text-white">
          {Math.min(index + 1, images.length)} / {images.length}
        </span>
      )}
    </div>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface shadow-bar">
      <div className="pb-safe mx-auto max-w-shell">
        <div className="flex items-center gap-1 px-3 py-2">{children}</div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="ratio-square">
        <div className="ratio-fill skeleton rounded-none" />
      </div>
      <div className="relative -mt-5 space-y-3 rounded-t-[22px] bg-surface px-4 py-5">
        <div className="skeleton h-8 w-2/5" />
        <div className="skeleton h-4 w-3/5" />
        <div className="skeleton h-6 w-4/5" />
      </div>
    </div>
  );
}
