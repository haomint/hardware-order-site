// 后台通用的表单部件。按钮和可点击区域高度不小于 44px，适合手机操作。
import { useEffect, useId } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "accent" | "outline" | "danger" | "ghost";

const buttonStyles: Record<ButtonVariant, string> = {
  // 苹果风格：主按钮蓝色纯色，次要按钮浅灰填充，危险操作浅红底红字，都不用描边
  primary: "bg-brand font-semibold text-white active:bg-brand-dark disabled:bg-page disabled:text-faint",
  accent: "bg-brand font-semibold text-white active:bg-brand-dark disabled:bg-page disabled:text-faint",
  outline: "bg-page text-ink active:opacity-70 disabled:text-faint",
  danger: "bg-red-50 text-red-600 active:bg-red-100 disabled:text-faint",
  ghost: "text-brand active:opacity-60 disabled:text-faint",
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-tap items-center justify-center gap-1.5 rounded-xl px-4 text-base font-medium ${buttonStyles[variant]} ${className}`}
      {...rest}
    />
  );
}

/** 带标题、说明和错误提示的表单项。children 接收控件的 id。 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-msg`;
  const hasMessage = Boolean(error || hint);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] text-ink">
        {label}
        {optional && <span className="ml-1 text-sm font-normal text-faint">（可不填）</span>}
      </label>
      {children(id, hasMessage ? messageId : undefined)}
      {error ? (
        <p id={messageId} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="mt-1.5 text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border bg-page px-3.5 text-base text-ink placeholder:text-faint focus:bg-surface focus:outline-none disabled:text-faint";

export function TextInput({ invalid, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${inputBase} h-12 ${invalid ? "border-red-400 focus:border-red-600" : "border-transparent focus:border-brand"} ${className}`}
      {...rest}
    />
  );
}

export function TextArea({
  invalid,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${inputBase} py-2.5 leading-relaxed ${invalid ? "border-red-400 focus:border-red-600" : "border-transparent focus:border-brand"} ${className}`}
      {...rest}
    />
  );
}

/** 开关：整行可点，左边文字说明，右边滑块。 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-tap w-full items-center justify-between gap-4 py-2 text-left disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-base text-ink">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-[#e9e9eb]"}`}
      >
        <span
          className={`absolute top-0.5 h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-surface p-4 shadow-card ${className}`}>
      {title && <h2 className="mb-3 text-[17px] font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}

/** 二次确认弹窗。用于删除等不可恢复的操作。 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={busy ? undefined : onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="pb-safe w-full max-w-sm rounded-2xl bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-base text-muted">{message}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-tap rounded-xl bg-red-600 text-base font-semibold text-white active:bg-red-700 disabled:bg-faint"
          >
            {busy ? "处理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 小标签，用于商品状态。 */
export function Badge({ tone, children }: { tone: "gray" | "blue" | "amber"; children: ReactNode }) {
  const tones = {
    gray: "bg-page text-muted",
    blue: "bg-brand-soft text-brand",
    amber: "bg-amber-50 text-amber-800",
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
