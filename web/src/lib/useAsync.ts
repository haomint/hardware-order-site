import { useCallback, useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: T }
  | { status: "ready"; data: T }
  | { status: "error"; error: Error; data?: undefined };

/**
 * 加载数据并跟踪状态。依赖变化时重新加载，并丢弃过期请求的结果，
 * 避免快速切换分类或输入搜索词时旧结果覆盖新结果。
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ status: "loading", data: previous.status === "ready" ? previous.data : undefined }));
    load().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
