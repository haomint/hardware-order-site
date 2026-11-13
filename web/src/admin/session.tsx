import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, UNAUTHENTICATED_EVENT } from "../api/index.ts";
import type { AdminSession } from "../api/index.ts";
import { ErrorNotice } from "../components/Feedback.tsx";

type SessionValue = { session: AdminSession; logout: () => Promise<void> };
const SessionContext = createContext<SessionValue | null>(null);

export function useAdminSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useAdminSession 只能在 RequireAdmin 内使用");
  return value;
}

/** 打开后台任何页面时先检查登录状态，未登录则带上原地址跳到登录页。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: "checking" } | { status: "in"; session: AdminSession } | { status: "out" } | { status: "error"; message: string }
  >({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "checking" });
    api.getSession().then(
      (session) => !cancelled && setState({ status: "in", session }),
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) setState({ status: "out" });
        else setState({ status: "error", message: error instanceof Error ? error.message : "加载失败，请重试。" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 使用中会话过期（任何后台接口返回未登录）时，回到登录页。
  useEffect(() => {
    const onExpired = () => setState({ status: "out" });
    window.addEventListener(UNAUTHENTICATED_EVENT, onExpired);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onExpired);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);

  if (state.status === "checking") {
    return <p className="py-20 text-center text-base text-muted">正在进入后台…</p>;
  }
  if (state.status === "error") {
    return <ErrorNotice message={state.message} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (state.status === "out") {
    const next = location.pathname + location.search;
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <SessionContext.Provider value={{ session: state.session, logout }}>{children}</SessionContext.Provider>;
}
