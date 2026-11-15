import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { ProductDetail as Product } from "../api/index.ts";
import { addToCart, MAX_LINES, MAX_QUANTITY } from "../lib/cart.ts";
import { useShop } from "../lib/shop.tsx";
import { useAsync } from "../lib/useAsync.ts";
import { useWhitePage } from "../lib/useWhitePage.ts";
import { Price } from "../components/Price.tsx";
import { EmptyNotice, ErrorNotice, toast } from "../components/Feedback.tsx";
import { openContact } from "../components/ContactSheet.tsx";
import { CartBadge } from "../components/TabBar.tsx";
import { BackIcon, CartIcon, HeadsetIcon, HomeIcon, MinusIcon, PlusIcon } from "../components/icons.tsx";

export function ProductDetail() {
  const { id = "" } = useParams();
  const { state, retry } = useAsync(() => api.getProduct(id), [id]);
  const shop = useShop();
  useWhitePage();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (state.status === "ready" && shop?.name) document.title = `${state.data.name} - ${shop.name}`;
  }, [state, shop?.name]);

  return (
    <div className="mx-auto min-h-screen max-w-shell bg-surface" style={{ paddingBottom: "calc(84px + var(--safe-bottom))" }}>
      <FloatingTopBar />
      {state.status === "loading" && <DetailSkeleton />}
      {state.status === "error" && (
        <div className="pt-16">
          {state.error instanceof ApiError && state.error.code === "PRODUCT_NOT_FOUND" ? (
            <EmptyNotice title="这件商品已下架或不存在">
              <Link
                to="/"
                className="mt-4 inline-flex min-h-tap items-center rounded-full bg-brand px-6 text-base font-medium text-white active:bg-brand-dark"
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
  const tap = "pointer-events-auto relative flex h-11 w-11 items-center justify-center active:opacity-70";
  const circle = "glass flex h-9 w-9 items-center justify-center rounded-full text-ink";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
      <div className="pt-safe mx-auto flex max-w-shell items-center justify-between px-3 pt-3">
        <button type="button" onClick={goBack} aria-label="返回" className={tap}>
          <span className={circle}>
            <BackIcon size={20} />
          </span>
        </button>
        <Link to="/cart" aria-label="购物车" className={tap}>
          <span className={circle}>
            <CartIcon size={19} />
          </span>
          <CartBadge className="right-0 top-0" />
        </Link>
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
    { label: "计价单位", value: product.unit },
  ].filter((fact) => fact.value.trim() !== "");
  const sub = [product.brand, product.model].filter((part) => part.trim() !== "").join(" · ");

  return (
    <>
      <Gallery images={images.map((image) => image.imageUrl)} dimmed={product.isOutOfStock} />

      <section className="px-5 pb-2 pt-5">
        {product.isOutOfStock && (
          <span className="mb-2 inline-block rounded-full bg-page px-2.5 py-1 text-[12px] font-medium text-muted">暂时缺货</span>
        )}
        <h1 className="headline text-[24px] font-semibold leading-snug text-ink">{product.name}</h1>
        {sub && <p className="mt-1 break-all text-[15px] text-muted">{sub}</p>}
        <div className="mt-3">
          <Price priceCents={product.priceCents} unit={product.unit} size="detail" />
        </div>
        <p className="mt-1 text-[13px] text-faint">
          {product.priceCents === null ? "价格需与店家确认，可先加入订货单" : "参考价，最终金额以商家联系确认为准，暂不含运费"}
        </p>

        {product.isOutOfStock ? (
          <p className="mt-5 rounded-2xl bg-page px-4 py-3 text-[15px] text-ink">暂时缺货，如有需要请联系店铺询问到货时间。</p>
        ) : (
          <QuantityRow quantity={quantity} unit={product.unit} onChange={setQuantity} />
        )}
      </section>

      {facts.length > 0 && (
        <Card title="规格">
          <dl className="divide-y divide-line border-y border-line">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline justify-between gap-4 py-3 text-[15px]">
                <dt className="shrink-0 text-muted">{fact.label}</dt>
                {/* 很长且没有空格的型号也要能换行 */}
                <dd className="min-w-0 break-all text-right text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card title="性能参数">
        <p className="whitespace-pre-line break-words text-[15px] leading-[1.8] text-ink">{product.specifications}</p>
      </Card>

      <Card title="订货说明">
        <ol className="space-y-2 text-[15px] leading-relaxed text-muted">
          <li>1. 选好商品加入购物车，提交订货单，无需注册和付款。</li>
          <li>2. 店家会电话或微信联系您，确认价格、运费和配送方式。</li>
          <li>3. 确认后线下付款，店家送货或您到店自提。</li>
        </ol>
      </Card>

      <BottomBar>
        <IconAction to="/" label="首页" icon={<HomeIcon size={22} strokeWidth={1.7} />} />
        <IconAction onClick={openContact} label="联系" icon={<HeadsetIcon size={22} strokeWidth={1.7} />} />
        <IconAction
          to="/cart"
          label="购物车"
          icon={
            <span className="relative">
              <CartIcon size={22} strokeWidth={1.7} />
              <CartBadge className="-right-2.5 -top-1.5" />
            </span>
          }
        />
        {product.isOutOfStock ? (
          <button
            type="button"
            onClick={openContact}
            className="ml-2 h-11 min-w-0 flex-1 rounded-full bg-brand text-[16px] font-semibold text-white active:bg-brand-dark"
          >
            缺货 · 联系店铺
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (addToCart(product, quantity) === "full") {
                toast(`购物车最多 ${MAX_LINES} 种商品，请先提交或移除一些`);
                return;
              }
              toast(`已加入购物车：${quantity} ${product.unit}`);
              setQuantity(1);
            }}
            className="ml-2 h-11 min-w-0 flex-1 rounded-full bg-brand text-[16px] font-semibold text-white active:bg-brand-dark"
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
    <section className="px-5 pt-8">
      <h2 className="headline mb-3 text-[22px] font-semibold text-ink">{title}</h2>
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
  const step = "-my-1 flex h-11 w-10 items-center justify-center text-ink active:opacity-50 disabled:text-faint/60";
  return (
    <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
      <span className="text-[16px] text-ink">
        数量<span className="ml-1 text-[13px] text-faint">（{unit}）</span>
      </span>
      <div className="flex h-9 items-center rounded-full bg-page">
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
          className="tabular h-9 w-10 bg-transparent text-center text-[16px] font-semibold focus:outline-none"
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
  const className = "flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-[11px] text-faint active:text-brand";
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

/**
 * 商品图片区的高度：约占屏幕高度的五分之二，不超过屏幕宽度（不会比正方形更高），
 * 横屏等很矮的屏幕上至少 220px。图片按原比例完整显示，不裁剪（店主要求，#72）。
 */
const MEDIA_HEIGHT = "h-[42vh] max-h-[min(100vw,640px)] min-h-[220px]";

/** 图片轮播：左右滑动切换，底部显示当前第几张。 */
function Gallery({ images, dimmed }: { images: string[]; dimmed: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="relative bg-page">
      <div
        ref={track}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        aria-label="商品图片，可左右滑动"
      >
        {images.map((src, i) => (
          <div key={src + i} className={`w-full shrink-0 snap-center ${MEDIA_HEIGHT}`}>
            <img
              src={src}
              alt={`商品图片 ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`h-full w-full object-contain px-6 pb-4 pt-12 mix-blend-multiply ${dimmed ? "opacity-55 grayscale" : ""}`}
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <span className="tabular absolute bottom-3 right-4 rounded-full bg-ink/40 px-2.5 py-0.5 text-[12px] text-white">
          {Math.min(index + 1, images.length)} / {images.length}
        </span>
      )}
    </div>
  );
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-30 shadow-bar">
      <div className="pb-safe mx-auto max-w-shell">
        <div className="flex items-center gap-1 px-3 py-2.5">{children}</div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`skeleton rounded-none ${MEDIA_HEIGHT}`} />
      <div className="space-y-3 px-5 py-5">
        <div className="skeleton h-8 w-2/5" />
        <div className="skeleton h-4 w-3/5" />
        <div className="skeleton h-6 w-4/5" />
      </div>
    </div>
  );
}
