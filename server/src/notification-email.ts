import { createTransport, type SendMailOptions } from "nodemailer";

const singleEmail = /^[a-z0-9._%+!-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

export function loadNotificationEmailConfig(env: NodeJS.ProcessEnv) {
  const host = env.NOTIFICATION_SMTP_HOST?.trim();
  const portText = env.NOTIFICATION_SMTP_PORT?.trim() || "465";
  const port = Number(portText);
  const security = env.NOTIFICATION_SMTP_SECURITY?.trim() || (port === 465 ? "tls" : "starttls");
  const user = env.NOTIFICATION_SMTP_USER?.trim();
  const pass = env.NOTIFICATION_SMTP_PASSWORD;
  const from = env.NOTIFICATION_EMAIL_FROM?.trim() || user;
  const to = env.NOTIFICATION_EMAIL_TO?.trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host) || !/^\d+$/.test(portText) || port < 1 || port > 65535 ||
      (security !== "tls" && security !== "starttls") || !user || !pass?.trim() ||
      !from || !singleEmail.test(from) || !to || !singleEmail.test(to)) return null;
  return { host, port, secure: security === "tls", user, pass, from, to };
}

export type SendNotificationMail = (message: SendMailOptions) => Promise<{ accepted: unknown[] }>;

function smtpSender(config: NonNullable<ReturnType<typeof loadNotificationEmailConfig>>): SendNotificationMail {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.pass },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return (message) => transport.sendMail(message);
}

export class NotificationEmailFailure extends Error {}

export function createNotificationEmailSender(
  config: NonNullable<ReturnType<typeof loadNotificationEmailConfig>>,
  sendMail = smtpSender(config),
) {
  return async (orderNo: string, text: string, signal: AbortSignal) => {
    const info = await sendMail({
      from: { address: config.from, name: "店铺订单提醒" },
      to: config.to,
      subject: `新订货单 #${orderNo}`,
      text,
      signal,
    }).catch((error: unknown) => {
      if (signal.aborted) throw new NotificationEmailFailure("EMAIL_TIMEOUT");
      // SMTP 响应可能含邮箱、认证信息等，仅保存可预期的数字错误码。
      const responseCode = error && typeof error === "object" && "responseCode" in error ? error.responseCode : null;
      if (typeof responseCode === "number" && Number.isInteger(responseCode) && responseCode >= 400 && responseCode <= 599) {
        throw new NotificationEmailFailure(`EMAIL_SMTP_${responseCode}`);
      }
      throw new NotificationEmailFailure("EMAIL_SEND_FAILED");
    });
    if (!info.accepted.length) throw new NotificationEmailFailure("EMAIL_RECIPIENT_REJECTED");
  };
}
