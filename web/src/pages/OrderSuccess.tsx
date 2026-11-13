import { useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { OrderReceipt } from "../api/index.ts";
import { copyText } from "../lib/clipboard.ts";
import { formatYuan } from "../lib/format.ts";
import { useShop } from "../lib/shop.tsx";
import { toast } from "../components/Feedback.tsx";
import { openContact } from "../components/ContactSheet.tsx";
import { CopyIcon, PhoneIcon } from "../components/icons.tsx";
import { LAST_ORDER_STORAGE } from "./Checkout.tsx";

export type OrderSummary = {
  receipt: OrderReceipt;
  deliveryMethod: "delivery" | "pickup";
  address: string | null;
  note: string;
};

function readLastOrder(): OrderSummary | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ORDER_STORAGE);
    return raw ? (JSON.parse(raw) as OrderSummary) : null;
  } catch {
    return null;
  }
}

/** 复制到微信的订单文字：订单号、联系人、配送方式、商品与数量、预估金额。 */
export function orderText(order: OrderSummary, shopName?: string): string {
  const { receipt } = order;
  const lines = [
    `【订货单】${receipt.orderNo}${shopName ? `（${shopName}）` : ""}`,
    `联系人：${receipt.contactName}`,
    `配送：${order.deliveryMethod === "pickup" ? "到店自提" : `送货${order.address ? `，${order.address}` : ""}`}`,
    "商品：",
    ...receipt.items.map((item) => {
      const label = item.model && !item.name.includes(item.model) ? `${item.name} ${item.model}` : item.name;
      return `· ${label} ×${item.quantity}${item.unit}${item.subtotalCents === null ? "（面议）" : `（¥${formatYuan(item.subtotalCents)}）`}`;
    }),
  ];
  const hasNegotiable = receipt.items.some((item) => item.unitPriceCents === null);
  lines.push(`预估商品金额：¥${formatYuan(receipt.estimatedTotalCents)}（${hasNegotiable ? "不含面议商品和运费" : "不含运费"}）`);
  if (order.note) lines.push(`备注：${order.note}`);
  return lines.join("\n");
}

export function OrderSuccess() {
  const location = useLocation();
  const shop = useShop();
  const order = (location.state as OrderSummary | null) ?? readLastOrder();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `订货单已提交 - ${shop?.name ?? "五金订货"}`;
  }, [shop?.name]);

  if (!order) return <Navigate to="/" replace />;
  const { receipt } = order;
  const hasNegotiable = receipt.items.some((item) => item.unitPriceCents === null);

  const copy = async (text: string, done: string) => toast((await copyText(text)) ? done : "复制失败，请长按文字手动复制");

  return (
    <div className="mx-auto min-h-screen max-w-shell px-4 pb-10 pt-8">
      <div className="text-center">
        <span className="bg-brand-gradient mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-brand">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold text-ink">订货单已提交</h1>
      </div>

      <div className="mt-5 rounded-card border border-amber-200 bg-amber-50 px-4 py-3.5" role="status">
        <p className="text-[17px] font-bold text-amber-900">等待商家联系，未完成付款</p>
        <p className="mt-1 text-[14px] leading-relaxed text-amber-900/80">
          店家会尽快通过电话或微信联系您，确认价格、运费和{order.deliveryMethod === "pickup" ? "取货时间" : "送货时间"}。网站不收款，请勿向陌生账户转账。
        </p>
      </div>

      <section className="mt-3 rounded-card bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">订单号</p>
            <p className="tabular text-[20px] font-bold tracking-wide text-ink">{receipt.orderNo}</p>
          </div>
          <button
            type="button"
            onClick={() => copy(receipt.orderNo, "订单号已复制")}
            className="flex min-h-tap shrink-0 items-center gap-1 rounded-full border border-line px-3 text-[14px] text-ink active:bg-page"
          >
            <CopyIcon size={16} />
            复制
          </button>
        </div>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {receipt.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-3 py-2.5">
              <p className="min-w-0 text-[15px] leading-snug text-ink">
                {item.name}
                <span className="ml-1 text-muted">
                  ×{item.quantity}
                  {item.unit}
                </span>
              </p>
              <span className={`tabular shrink-0 text-[15px] ${item.subtotalCents === null ? "font-semibold text-brand" : "font-bold text-ink"}`}>
                {item.subtotalCents === null ? "面议" : `¥${formatYuan(item.subtotalCents)}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[14px] text-muted">预估商品金额</span>
          <span className="tabular text-[20px] font-extrabold text-accent">¥{formatYuan(receipt.estimatedTotalCents)}</span>
        </div>
        <p className="mt-0.5 text-right text-[12px] text-faint">{hasNegotiable ? "不含面议商品和运费" : "不含运费"}，最终金额以商家确认为准</p>
      </section>

      <button
        type="button"
        onClick={() => copy(orderText(order, shop?.name), "订单内容已复制，可粘贴到微信发给店家")}
        className="bg-accent-gradient mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[17px] font-bold text-white shadow-accent"
      >
        <CopyIcon size={19} />
        复制订单内容
      </button>
      <p className="mt-1.5 text-center text-[13px] text-muted">可粘贴到微信发给店家，方便核对</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {shop?.phone ? (
          <a href={`tel:${shop.phone}`} className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border border-line bg-surface text-[15px] font-medium text-ink active:bg-page">
            <PhoneIcon size={18} />
            拨打店铺电话
          </a>
        ) : (
          <button type="button" onClick={openContact} className="min-h-[48px] rounded-full border border-line bg-surface text-[15px] font-medium text-ink">
            联系店铺
          </button>
        )}
        <Link to="/" replace className="flex min-h-[48px] items-center justify-center rounded-full border border-line bg-surface text-[15px] font-medium text-brand active:bg-page">
          继续选购
        </Link>
      </div>
    </div>
  );
}
