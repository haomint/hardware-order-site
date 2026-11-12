import { useEffect, useState } from "react";
import type { ReactNode } from "react";

/** 加载失败时的提示，带「重试」按钮。 */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-4 my-10 rounded-card bg-surface p-6 text-center shadow-card" role="alert">
      <p className="text-base text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-tap rounded-control bg-brand px-6 text-base font-medium text-white active:bg-brand-dark"
      >
        重试
      </button>
    </div>
  );
}

export function EmptyNotice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-4 my-10 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

type ToastState = { id: number; text: string } | null;
let pushToast: (text: string) => void = () => {};

/** 在任意位置调用，短暂显示一条提示。 */
export function toast(text: string) {
  pushToast(text);
}

/** 全局只挂载一次。 */
export function ToastHost() {
  const [current, setCurrent] = useState<ToastState>(null);

  useEffect(() => {
    pushToast = (text) => setCurrent({ id: Date.now(), text });
    return () => {
      pushToast = () => {};
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), 2200);
    return () => window.clearTimeout(timer);
  }, [current]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-1/3 z-50 flex justify-center px-6"
    >
      {current && (
        <div className="max-w-full rounded-control bg-ink/90 px-5 py-3 text-center text-base text-white shadow-lg">
          {current.text}
        </div>
      )}
    </div>
  );
}
