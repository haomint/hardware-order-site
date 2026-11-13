import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/index.ts";
import type { CartLookupResult, CreateOrder } from "../api/index.ts";
import { clearCart, refreshSnapshots, useCart } from "../lib/cart.ts";
import { loadContact, saveContact, uuidv4 } from "../lib/contact.ts";
import { formatYuan } from "../lib/format.ts";
import { useShop } from "../lib/shop.tsx";
import { ErrorNotice, toast } from "../components/Feedback.tsx";
import { BackIcon, TruckIcon } from "../components/icons.tsx";

type LookupItem = CartLookupResult["items"][number];
type Delivery = "delivery" | "pickup";
type Field = "contactName" | "phone" | "address" | "note";
type Errors = Partial<Record<Field, string>>;

/** 防重复提交键保存在本次浏览会话里：页面刷新或网络失败重试时沿用同一个键。 */
const KEY_STORAGE = "checkout.key";
/** 下单成功后交给成功页的内容。 */
export const LAST_ORDER_STORAGE = "order.last";

function sessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionSet(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // 忽略：只影响刷新后的重试体验。
  }
}

function currentKey() {
  const existing = sessionGet(KEY_STORAGE);
  if (existing) return existing;
  const key = uuidv4();
  sessionSet(KEY_STORAGE, key);
  return key;
}

function check(values: { contactName: string; phone: string; delivery: Delivery; address: string; note: string }): Errors {
  const errors: Errors = {};
  const name = values.contactName.trim();
  if (name.length < 2) errors.contactName = name ? "联系人姓名至少 2 个字。" : "请填写联系人姓名。";
  else if (name.length > 30) errors.contactName = "联系人姓名不能超过 30 个字。";
  const phone = values.phone.trim();
  if (!phone) errors.phone = "请填写手机号，方便店家联系您。";
  else if (!/^1[3-9][0-9]{9}$/.test(phone)) errors.phone = "请填写 11 位手机号。";
  if (values.delivery === "delivery") {
    const address = values.address.trim();
    if (!address) errors.address = "选择送货时，请填写收货地址。";
    else if (address.length > 200) errors.address = "收货地址不能超过 200 个字。";
  }
  if (values.note.trim().length > 300) errors.note = "备注不能超过 300 个字。";
  return errors;
}

export function Checkout() {
  const navigate = useNavigate();
  const shop = useShop();
  const lines = useCart();
  const saved = useRef(loadContact()).current;

  const [contactName, setContactName] = useState(saved?.contactName ?? "");
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [delivery, setDelivery] = useState<Delivery>(saved?.deliveryMethod ?? "delivery");
  const [address, setAddress] = useState(saved?.address ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<LookupItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const submitted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `提交订货单 - ${shop?.name ?? "五金订货"}`;
  }, [shop?.name]);

  // 进入时重新确认商品状态。有不可订商品时回到购物车处理；购物车为空时回购物车。
  const ids = lines.map((line) => line.productId).join(",");
  useEffect(() => {
    if (submitted.current) return;
    if (lines.length === 0) {
      navigate("/cart", { replace: true });
      return;
    }
    let cancelled = false;
    setLoadError("");
    api.lookupCart(lines.map((line) => line.productId)).then(
      (result) => {
        if (cancelled) return;
        if (result.items.some((item) => item.availability !== "available")) {
          toast("部分商品暂时无法订购，请先在购物车处理");
          navigate("/cart", { replace: true });
          return;
        }
        refreshSnapshots(result.items.flatMap((item) => ("product" in item ? [item.product] : [])));
        setItems(result.items);
      },
      (error: unknown) => !cancelled && setLoadError(error instanceof Error ? error.message : "加载失败，请重试。"),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, attempt]);

  const byId = new Map((items ?? []).map((item) => [item.productId, item]));
  let totalCents = 0;
  let hasNegotiable = false;
  for (const line of lines) {
    const item = byId.get(line.productId);
    const price = item && "product" in item ? item.product.priceCents : null;
    if (price === null) hasNegotiable = true;
    else totalCents += price * line.quantity;
  }

  const clearError = (field: Field) => setErrors((previous) => ({ ...previous, [field]: undefined }));
  const scrollToFirstError = () =>
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !items) return;
    const found = check({ contactName, phone, delivery, address, note });
    setErrors(found);
    setBanner("");
    if (Object.values(found).some(Boolean)) {
      scrollToFirstError();
      return;
    }

    const input: CreateOrder = {
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      contactName: contactName.trim(),
      phone: phone.trim(),
      deliveryMethod: delivery,
      ...(delivery === "delivery" ? { address: address.trim() } : {}),
      note: note.trim(),
    };

    setSubmitting(true);
    try {
      const receipt = await api.createOrder(input, currentKey());
      submitted.current = true;
      saveContact({ contactName: input.contactName, phone: input.phone, deliveryMethod: delivery, address: address.trim() || saved?.address || "" });
      sessionSet(KEY_STORAGE, null);
      const summary = { receipt, deliveryMethod: delivery, address: input.address ?? null, note: input.note };
      sessionSet(LAST_ORDER_STORAGE, JSON.stringify(summary));
      clearCart();
      navigate("/order/success", { replace: true, state: summary });
    } catch (caught) {
      setSubmitting(false);
      if (!(caught instanceof ApiError)) {
        setBanner("提交失败，请重试。");
        return;
      }
      switch (caught.code) {
        case "INVALID_REQUEST": {
          const fe = caught.fieldErrors ?? {};
          const mapped: Errors = { contactName: fe.contactName, phone: fe.phone, address: fe.address, note: fe.note };
          setErrors(mapped);
          if (Object.values(mapped).some(Boolean)) scrollToFirstError();
          else setBanner("订货商品有误，请返回购物车检查后重新提交。");
          break;
        }
        case "ORDER_PRODUCTS_UNAVAILABLE":
          toast("刚才有商品下架或缺货，请在购物车调整后重新提交");
          navigate("/cart", { replace: true });
          break;
        case "IDEMPOTENCY_KEY_CONFLICT":
          // 上一次提交可能已经成功（例如网络中断时），但内容被改过。换一个新键，并请客户确认。
          sessionSet(KEY_STORAGE, uuidv4());
          setBanner("刚才的订货单可能已经提交成功。如不确定，请先联系店铺确认；确认要按现在的内容提交，请再点一次「提交订货单」。");
          break;
        case "NETWORK_ERROR":
          setBanner("网络不太顺畅，请检查网络后再点一次「提交订货单」，不会重复下单。");
          break;
        default:
          setBanner(caught.message);
      }
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-shell" style={{ paddingBottom: "calc(112px + var(--safe-bottom))" }}>
      <header className="sticky top-0 z-30 flex h-12 items-center border-b border-line bg-surface/95 px-1">
        <button
          type="button"
          onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/cart"))}
          className="flex min-h-tap items-center gap-0.5 pl-2 pr-3 text-base text-ink active:opacity-60"
        >
          <BackIcon />
          购物车
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-bold text-ink">提交订货单</h1>
      </header>

      {loadError ? (
        <ErrorNotice message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !items ? (
        <p className="py-16 text-center text-muted">正在核对商品…</p>
      ) : (
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-3 px-4 pt-3">
          {banner && (
            <p role="alert" className="rounded-card bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-900">
              {banner}
            </p>
          )}

          <Card title={`订货商品（${lines.length} 种）`}>
            <ul className="divide-y divide-line">
              {lines.map((line) => {
                const item = byId.get(line.productId);
                const product = item && "product" in item ? item.product : undefined;
                const subtotal = product && product.priceCents !== null ? product.priceCents * line.quantity : null;
                return (
                  <li key={line.productId} className="flex items-center gap-3 py-2.5">
                    {product && (
                      <img src={product.mainImage.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line bg-white object-contain" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[15px] leading-snug text-ink">{product?.name ?? line.name}</p>
                      <p className="text-[13px] text-muted">
                        ×{line.quantity} {product?.unit ?? line.unit}
                      </p>
                    </div>
                    <span className={`tabular shrink-0 text-[15px] ${subtotal === null ? "font-semibold text-brand" : "font-bold text-ink"}`}>
                      {subtotal === null ? "面议" : `¥${formatYuan(subtotal)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link to="/cart" className="mt-1 inline-flex min-h-tap items-center text-[14px] text-brand">
              修改商品或数量
            </Link>
          </Card>

          <Card title="联系信息">
            <div className="space-y-4">
              <Input
                label="联系人"
                value={contactName}
                onChange={(v) => {
                  setContactName(v);
                  clearError("contactName");
                }}
                error={errors.contactName}
                placeholder="例如：张先生"
                autoComplete="name"
                maxLength={30}
              />
              <Input
                label="手机号"
                value={phone}
                onChange={(v) => {
                  setPhone(v.replace(/[^\d]/g, "").slice(0, 11));
                  clearError("phone");
                }}
                error={errors.phone}
                placeholder="店家会打这个电话联系您"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={11}
              />
            </div>
          </Card>

          <Card title="配送方式">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="配送方式">
              {(
                [
                  ["delivery", "送货上门"],
                  ["pickup", "到店自提"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={delivery === value}
                  onClick={() => {
                    setDelivery(value);
                    clearError("address");
                  }}
                  className={`min-h-[48px] rounded-control border-2 text-[16px] font-semibold ${
                    delivery === value ? "border-brand bg-brand-soft text-brand" : "border-line text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {delivery === "delivery" ? (
              <div className="mt-4">
                <TextArea
                  label="收货地址"
                  value={address}
                  onChange={(v) => {
                    setAddress(v);
                    clearError("address");
                  }}
                  error={errors.address}
                  placeholder="区、街道、门牌号或工地名称"
                  maxLength={200}
                  rows={3}
                  autoComplete="street-address"
                />
              </div>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-page px-3 py-2.5 text-[14px] text-muted">
                <TruckIcon size={18} className="mt-0.5 shrink-0 text-brand" />
                店家确认后会通知您到店取货，无需填写地址。
              </p>
            )}
          </Card>

          <Card title="备注（可不填）">
            <TextArea
              label="订单备注"
              hideLabel
              value={note}
              onChange={(v) => {
                setNote(v);
                clearError("note");
              }}
              error={errors.note}
              placeholder="例如：希望明天上午送到；需要发票；规格说明"
              maxLength={300}
              rows={3}
            />
          </Card>

          <p className="px-1 text-center text-[13px] leading-relaxed text-muted">
            提交即表示您同意店家按
            {/* 句中链接：上下各扩出 13px 点击区域，外观不变 */}
            <Link to="/privacy" className="relative mx-0.5 text-brand underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-[13px] after:content-['']">
              隐私说明
            </Link>
            使用以上信息联系您
          </p>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface shadow-bar">
            <div className="pb-safe mx-auto max-w-shell">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">预估商品金额</p>
                  <p className="tabular text-accent">
                    <span className="text-[15px] font-bold">¥</span>
                    <span className="text-[24px] font-extrabold leading-tight">{formatYuan(totalCents)}</span>
                  </p>
                  <p className="text-[11px] leading-tight text-faint">{hasNegotiable ? "不含面议商品和运费" : "不含运费"}，以店家确认为准</p>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-accent-gradient h-12 shrink-0 rounded-full px-6 text-[16px] font-bold text-white shadow-accent disabled:opacity-60"
                >
                  {submitting ? "正在提交…" : "提交订货单"}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-[16px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  inputMode?: "text" | "numeric" | "tel";
  autoComplete?: string;
};

function Input({ label, value, onChange, error, ...rest }: InputProps) {
  const id = `f-${label}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`h-12 w-full rounded-control border bg-surface px-3 text-base text-ink placeholder:text-faint focus:outline-none ${
          error ? "border-red-400 focus:border-red-600" : "border-line focus:border-brand"
        }`}
        {...rest}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[14px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({
  label,
  hideLabel,
  value,
  onChange,
  error,
  maxLength,
  ...rest
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  maxLength: number;
  rows?: number;
  autoComplete?: string;
}) {
  const id = `f-${label}`;
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1.5 block text-[15px] font-medium text-ink"}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        maxLength={maxLength}
        className={`w-full rounded-control border bg-surface px-3 py-2.5 text-base leading-relaxed text-ink placeholder:text-faint focus:outline-none ${
          error ? "border-red-400 focus:border-red-600" : "border-line focus:border-brand"
        }`}
        {...rest}
      />
      <div className="mt-1 flex justify-between gap-3 text-[13px]">
        <span className="text-red-700" id={error ? `${id}-err` : undefined}>
          {error}
        </span>
        <span className="tabular shrink-0 text-faint">
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
