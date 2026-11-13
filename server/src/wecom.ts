import { notificationRetryTiming } from "../../shared/index.ts";

export function loadWecomConfig(env: NodeJS.ProcessEnv) {
  const corpId = env.WECOM_CORP_ID?.trim();
  const agentId = env.WECOM_AGENT_ID?.trim();
  const secret = env.WECOM_SECRET?.trim();
  const userId = env.WECOM_USER_ID?.trim();
  if (!corpId || !agentId || !secret || !userId) return null;
  const numericAgentId = Number(agentId);
  if (!/^\d+$/.test(agentId) || !Number.isSafeInteger(numericAgentId) || numericAgentId < 1 ||
      userId === "@all" || userId.includes("|")) return null;
  return { corpId, agentId: numericAgentId, secret, userId };
}

type WecomConfig = NonNullable<ReturnType<typeof loadWecomConfig>>;
type ApiResult = {
  errcode?: unknown;
  access_token?: unknown;
  expires_in?: unknown;
  invaliduser?: unknown;
  unlicenseduser?: unknown;
};

const apiBase = "https://qyapi.weixin.qq.com/cgi-bin/";
const invalidTokens = new Set([40014, 42001]);
const permanentErrors = new Set([40001, 40013, 40056, 60020]);

export class WecomFailure extends Error {
  readonly retryable: boolean;

  constructor(code: string, retryable = true) {
    super(code);
    this.retryable = retryable;
  }
}

function errorCode(result: ApiResult) {
  return typeof result.errcode === "number" && Number.isSafeInteger(result.errcode) ? result.errcode : undefined;
}

function requireSuccess(result: ApiResult) {
  const code = errorCode(result);
  if (code === 0) return;
  if (code === undefined) throw new WecomFailure("WECOM_INVALID_RESPONSE");
  throw new WecomFailure(`WECOM_${code}`, !permanentErrors.has(code));
}

export function createWecomSender(config: WecomConfig, now: () => number, request = fetch) {
  let token: { value: string; expiresAt: number } | undefined;

  async function call(url: URL, signal: AbortSignal, body?: object): Promise<ApiResult> {
    try {
      const response = await request(url, {
        signal,
        redirect: "error",
        ...(body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new WecomFailure(`WECOM_HTTP_${response.status}`);
      }
      const value: unknown = await response.json();
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new WecomFailure("WECOM_INVALID_RESPONSE");
      }
      return value;
    } catch (error) {
      if (error instanceof WecomFailure) throw error;
      // fetch 的错误可能带请求 URL，不能写入数据库或日志。
      throw new WecomFailure(signal.aborted ? "WECOM_TIMEOUT" : "WECOM_REQUEST_FAILED");
    }
  }

  async function accessToken(signal: AbortSignal) {
    if (token && token.expiresAt > now()) return token.value;
    const url = new URL("gettoken", apiBase);
    url.searchParams.set("corpid", config.corpId);
    url.searchParams.set("corpsecret", config.secret);
    const startedAt = now();
    const response = await call(url, signal);
    requireSuccess(response);
    const { access_token: value, expires_in: seconds } = response;
    if (typeof value !== "string" || !value || typeof seconds !== "number" ||
        !Number.isSafeInteger(seconds) || seconds < 1) {
      throw new WecomFailure("WECOM_INVALID_RESPONSE");
    }
    token = { value, expiresAt: startedAt + seconds * 1000 - Math.min(60_000, seconds * 100) };
    return value;
  }

  async function send(content: string, signal: AbortSignal) {
    const url = new URL("message/send", apiBase);
    url.searchParams.set("access_token", await accessToken(signal));
    return call(url, signal, {
      touser: config.userId,
      agentid: config.agentId,
      msgtype: "text",
      text: { content },
      enable_duplicate_check: 1,
      duplicate_check_interval: 1800,
    });
  }

  return async (content: string, signal = AbortSignal.timeout(notificationRetryTiming.channelTimeoutSeconds * 1000)) => {
    let result = await send(content, signal);
    if (invalidTokens.has(errorCode(result) ?? -1)) {
      token = undefined;
      result = await send(content, signal);
    }
    if (invalidTokens.has(errorCode(result) ?? -1)) token = undefined;
    requireSuccess(result);
    if (result.invaliduser || result.unlicenseduser) throw new WecomFailure("WECOM_INVALID_RECIPIENT", false);
  };
}
