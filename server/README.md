# server

阶段 A 后端使用 Node.js 24 或以上版本、Hono 和 SQLite。接口定义见 [阶段 A 契约](../docs/api/stage-a.md)。

## 本地启动

在仓库根目录用 PowerShell 运行：

```powershell
npm.cmd --prefix shared ci
npm.cmd --prefix server ci
Copy-Item server/.env.example server/.env
```

按需填写 `server/.env` 的店铺资料。首次运行以下命令设置管理员账号，之后也可用同一命令重置密码并注销旧会话：

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

## 验证

```powershell
npm.cmd --prefix server run typecheck
npm.cmd --prefix server test
```

测试使用临时数据库和图片目录，覆盖登录与续期、分类与商品操作、上架可见性、图片处理及引用清理。
