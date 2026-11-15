# server

阶段 A 后端使用 Node.js 24 或以上版本、Hono 和 SQLite。接口定义见 [阶段 A 契约](../docs/api/stage-a.md)。

## 本地启动

在仓库根目录用 PowerShell 运行：

```powershell
npm.cmd --prefix shared ci
npm.cmd --prefix server ci
Copy-Item server/.env.example server/.env
```

按需填写 `server/.env` 的店铺资料。每个数据库首次启动时用 `SHOP_NAME`、`SHOP_PHONE` 和 `SHOP_WECHAT_CONTACT_TEXT` 初始化，之后以后台「店铺资料」保存的值为准。首次运行以下命令设置管理员账号，之后也可用同一命令重置密码并注销旧会话：

```powershell
$env:ADMIN_USERNAME = Read-Host '管理员账号'
$env:ADMIN_PASSWORD = Read-Host '管理员密码' -MaskInput
try {
    npm.cmd --prefix server run admin:set
} finally {
    Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
}
npm.cmd --prefix server start
```

服务默认监听 `127.0.0.1:3000`。启动时自动执行 `server/migrations/` 中尚未应用的 SQL 文件。用 `Invoke-RestMethod http://localhost:3000/api/shop` 查看店铺资料。

前端切换到真实后端时，在自己的开发环境配置中设置 `VITE_USE_MOCK=false`。Vite 会代理 `/api` 和 `/uploads`。手机通过局域网地址访问 Vite 时，将该完整来源加入后端的 `DEV_ALLOWED_ORIGINS`，例如 `http://192.168.1.20:5173`。开发环境跨端口直连后台 API 时，请求需携带 Cookie。

## 部署配置

- 生产环境设置 `NODE_ENV=production` 和 HTTPS 的 `SITE_ORIGIN`。后台 Cookie 使用 `Secure`，写操作仅接受配置的站点来源。
- 将 `DATABASE_PATH` 和 `UPLOAD_DIR` 指向持久化目录。反向代理转发 `/api` 和 `/uploads`，上传路径的 Nginx 配置可用 `client_max_body_size 11m`，为 10 MiB 图片预留表单封装空间。
- 登录按 IP 统计过去 15 分钟内的失败次数，同一 IP 达到 10 次后返回 429。全站同时保留 100 次失败的上限。成功登录清除该 IP 的失败次数，全站的历史失败次数照常过期。
- `TRUST_PROXY` 默认是 `false`，登录限流使用 TCP 对端地址。仅在后端只能经可信反向代理访问时设为 `true`。开启后使用 `X-Forwarded-For` 最右侧的地址，缺失或无效时依次回退到 `X-Real-IP`、TCP 对端地址。Nginx 应覆盖两个转发头：

  ```nginx
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Real-IP $remote_addr;
  ```

- 上传后只保存压缩 JPEG 和缩略图。未关联的上传保留 24 小时。移除图片或删除商品后，服务端清理无引用的图片，并定时重试文件清理。

## 企业微信新订单提醒

服务器通过企业微信自建应用发送消息。设置 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET` 和 `WECOM_USER_ID`。接收人填应用可见范围内的一位管理员的成员账号。上线时将服务器公网 IP 加入企业可信 IP，管理员通过微信插件验证能否在普通微信收到提醒。

订单和提醒记录一起入库，后台每秒检查待发送的提醒。网络等临时错误最多重试三次，分别等待 30 秒、2 分钟和 10 分钟。未配置或确认无法发送时记录失败，订单仍可正常查看。

配置 `NOTIFICATION_SMTP_HOST`、`NOTIFICATION_SMTP_PORT`、`NOTIFICATION_SMTP_USER`、`NOTIFICATION_SMTP_PASSWORD` 和 `NOTIFICATION_EMAIL_TO` 启用新订单备用邮件。密码使用邮箱服务商的 SMTP 授权码或应用专用密码。发件邮箱可用 `NOTIFICATION_EMAIL_FROM` 指定，默认使用 SMTP 账号。端口默认 465，使用 TLS。非 465 端口默认强制 STARTTLS，也可通过 `NOTIFICATION_SMTP_SECURITY` 明确选择 `tls` 或 `starttls`。

企业微信重试用完或确认不可用时，后台尝试发送一封邮件。只有邮件配置时，新订单直接走邮件。后台手动重发按可用渠道顺序各尝试一次，单个渠道最多 10 秒，整轮最多 30 秒。邮件只含订单摘要，SMTP 接收后记为已发送。SMTP 结果未知时保留失败记录，由管理员决定是否再次重发。

待联系订单从进入该状态起计时，默认满 120 分钟补发一次。可用 `ORDER_TIMEOUT_MINUTES` 调整时长，`ORDER_TIMEOUT_QUIET_START` 和 `ORDER_TIMEOUT_QUIET_END` 调整北京时间的静默时段，默认 21:00 至次日 08:00，起止相同表示全天可发送。静默时段结束后，仍待联系且已超时的订单会补发。

超时提醒独立记账，重启后重新检查到期订单。首次调用企业微信发送接口后，未确认的发送在企业微信去重窗口内以相同内容恢复。超出恢复窗口仍未确认时，记录为送达未知，避免主动重复发送。真实送达需要企业微信配置正常。

## 验证

```powershell
npm.cmd --prefix server run typecheck
npm.cmd --prefix server test
```

测试使用临时数据库和图片目录，覆盖登录与续期、分类与商品操作、上架可见性、图片处理及引用清理。
