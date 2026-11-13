import { useEffect, useSyncExternalStore } from "react";
import { useShop } from "../lib/shop.tsx";
import { copyText } from "../lib/clipboard.ts";
import { toast } from "./Feedback.tsx";
import { ChatIcon, CloseIcon, CopyIcon, PhoneIcon } from "./icons.tsx";

// 「联系店铺」面板：任何页面调用 openContact() 打开，全站只挂载一个 <ContactSheet />。
let open = false;
const listeners = new Set<() => void>();
function setOpen(next: boolean) {
  open = next;
  listeners.forEach((listener) => listener());
}
export function openContact() {
  setOpen(true);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ContactSheet() {
  const isOpen = useSyncExternalStore(subscribe, () => open);
  const shop = useShop();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // 打开时禁止背后页面滚动。
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const phone = shop?.phone ?? "";
  const wechat = shop?.wechatContactText ?? "";

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/45" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        className="animate-sheet pb-safe w-full max-w-shell rounded-t-[22px] bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 id="contact-title" className="text-lg font-bold text-ink">
            联系{shop?.name ?? "店铺"}
          </h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-page"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-6">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-3 rounded-card bg-page p-4 active:bg-brand-soft">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-brand">
                <PhoneIcon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">拨打电话</span>
                <span className="tabular block text-sm text-muted">{phone}</span>
              </span>
              <span className="text-[15px] font-medium text-brand">拨打</span>
            </a>
          )}
          {wechat && (
            <div className="flex items-center gap-3 rounded-card bg-page p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#07c160] text-white">
                <ChatIcon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">微信联系</span>
                <span className="block break-words text-sm text-muted">{wechat}</span>
              </span>
              <button
                type="button"
                onClick={async () => toast((await copyText(wechat)) ? "已复制，可到微信粘贴" : "复制失败，请长按文字手动复制")}
                className="flex min-h-tap shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink active:bg-brand-soft"
              >
                <CopyIcon size={16} />
                复制
              </button>
            </div>
          )}
          {!phone && !wechat && <p className="py-6 text-center text-base text-muted">店铺暂未设置联系方式。</p>}
          <p className="pt-1 text-center text-sm text-faint">下单后店家会主动联系您确认价格和配送</p>
        </div>
      </div>
    </div>
  );
}
