import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, usingMock } from "../api/index.ts";
import { useShop } from "../lib/shop.tsx";
import { Button, Field, TextInput } from "./ui.tsx";

/** 登录后只允许跳回后台内部地址，防止被链接参数带到别的网站。 */
function safeNext(value: string | null): string {
  return value && value.startsWith("/admin") && !value.startsWith("//") ? value : "/admin";
}

export function Login() {
  const shop = useShop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ username: string; password: string } | null>(null);

  useEffect(() => {
    document.title = "店铺后台登录";
    if (usingMock) {
      import("../api/mock.ts").then((mock) => setDemo({ username: mock.MOCK_USERNAME, password: mock.MOCK_PASSWORD }));
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (username.trim() === "" || password === "") {
      setError("请填写账号和密码。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.login({ username: username.trim(), password });
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "登录失败，请重试。");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-page px-4 pt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold text-ink">店铺后台</h1>
        {shop?.name && <p className="mt-1 text-center text-base text-muted">{shop.name}</p>}

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-card bg-surface p-5 shadow-card" noValidate>
          <Field label="账号">
            {(id) => (
              <TextInput
                id={id}
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={64}
              />
            )}
          </Field>
          <Field label="密码">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={256}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="rounded-control bg-red-50 px-3 py-2.5 text-[15px] text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="h-12 w-full text-lg">
            {busy ? "正在登录…" : "登录"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">忘记密码请联系网站维护人员在服务器上重置。</p>

        {demo && (
          <p className="mt-6 rounded-control border border-dashed border-line px-3 py-2.5 text-center text-sm text-muted">
            当前是演示数据，账号 <b className="text-ink">{demo.username}</b>，密码 <b className="text-ink">{demo.password}</b>
          </p>
        )}
      </div>
    </div>
  );
}
