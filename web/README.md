# web

前端（前台商城 + 后台管理），由 Claude 负责。约束见 `docs/开发约束.md` 第 4 节。

## 运行

需要 Node.js 24 或更高版本。在仓库根目录执行：

```sh
npm --prefix web install
npm --prefix web run dev
```

浏览器打开 `http://localhost:5173`。手机与电脑在同一 Wi-Fi 时，也可以用终端里显示的 `Network` 地址在手机上打开。

其他命令：

```sh
npm --prefix web run typecheck   # 类型检查
npm --prefix web run build       # 正式构建，产物在 web/dist
```

## 三种运行方式

| 命令 | 数据来源 | 用途 |
|---|---|---|
| `npm --prefix web run dev` | 假数据（`src/api/mock.ts`），不需要后端 | 只看页面效果 |
| `npm --prefix web run dev:api` | 本机真实后端 | 前后端联调 |
| `npm --prefix web run build` | 真实后端（同源 `/api`） | 正式打包 |

- **只有 `dev` 使用假数据**。这由 `vite.config.ts` 在编译时决定：正式打包一定连真实后端，假数据、演示账号和占位商品图都不会进入构建产物，不存在「忘了改开关就带着假数据上线」的情况。
- `dev:api` 默认把 `/api` 和 `/uploads` 转发到 `http://localhost:3000`，浏览器看到的是同源请求。后端地址不同时，在 `web/.env.api.local` 里写 `VITE_BACKEND_ORIGIN=http://localhost:端口`（该文件不会提交）。
- 假数据的结构来自 `shared/` 契约，行为按 `docs/api/stage-a.md` 模拟。`src/api/mock-images/` 是假数据用的占位图。

### 连真实后端联调

1. 按 [server/README.md](../server/README.md) 准备 `server/.env`、设置管理员账号并启动后端（默认端口 3000）。后端的 `SITE_ORIGIN` 保持 `http://localhost:5173`。
2. 运行 `npm --prefix web run dev:api`，打开 `http://localhost:5173`，后台在 `/admin`，用第 1 步设置的管理员账号登录。

### 用手机联调

1. 查到电脑在 Wi-Fi 里的地址（Windows：`ipconfig` 里「无线局域网」的 IPv4 地址，例如 `192.168.1.20`）。
2. 在 `server/.env` 的 `DEV_ALLOWED_ORIGINS` 里加上 `http://192.168.1.20:5173`，并把 `HOST` 改为 `0.0.0.0` 后重启后端。否则手机上能浏览，但登录和保存会提示「请从店铺后台页面操作」。
3. 手机连同一个 Wi-Fi，打开 `http://192.168.1.20:5173`。Windows 第一次可能弹出防火墙提示，需要允许 Node.js 访问网络。

## 目录

| 位置 | 内容 |
|---|---|
| `src/index.css` | 设计变量（颜色、圆角）。调整整体风格只改这里 |
| `src/api/` | 数据请求。`index.ts` 是唯一入口，`http.ts` 请求真实后端，`mock.ts` 是假数据（只在 `npm run dev` 时使用） |
| `src/lib/` | 购物车（本机存储）、店铺资料、金额格式化等 |
| `src/components/` | 商品卡片、价格、底部导航、联系店铺面板、横幅等通用部件 |
| `src/components/art.ts` | 内置五金插图：分类图标按名称关键词自动匹配，横幅和假数据商品图也用它 |
| `src/pages/` | 商城页面：首页 `Home.tsx`、分类 `Categories.tsx`、商品详情 `ProductDetail.tsx` |
| `src/admin/` | 后台页面，单独打包、按需加载：登录、商品列表与编辑、分类管理 |
| `src/lib/image.ts` | 上传前把照片缩小到长边 1600 像素并转成 JPEG（含苹果手机的 HEIC 照片） |

## 当前进度（阶段 A）

- 商城：首页（搜索、分类、商品列表）、商品详情页。
- 后台（地址 `/admin`）：登录与退出、商品列表（搜索、按上架/下架/缺货筛选）、新增与编辑商品（图片上传、价格面议、缺货、置顶、排序）、删除商品、分类的增删改。
- 购物车：已能加入并保存在本机，购物车页面和提交订货单属于阶段 B。
- 订单管理：阶段 B。
- 已与阶段 A 真实后端联调通过（#8）。

`npm run dev`（假数据）时后台的演示账号是 `admin` / `demo1234`，登录页上也会显示。这个账号只在假数据里有效，正式版本中不存在；真实后端的管理员账号用 `npm --prefix server run admin:set` 设置。

## 手机适配

- **苹果手机**：底部导航和底部按钮留出底部横条的安全区；输入框字号不小于 16px，聚焦时不放大页面。
- **旧版 iOS（14 及以下）**：正方形图片用 `ratio-square` 类（padding 撑高），不依赖 aspect-ratio。
- **安卓与微信**：去掉点击延迟；字体优先用系统中文字体（鸿蒙、MiSans、思源黑体）；复制文字对旧版微信有兜底。
- 已在 360×780、375×667、390×844、412×915、430×932 五种尺寸下检查。

## 技术选择说明

- **Tailwind CSS 用 3.x 而不是 4.x**：4.x 要求 iOS 16.4 以上，会把仍在使用的旧 iPhone 挡在外面。
- **数据类型只做类型引用**：从 `shared/` 引入的是类型，构建时被擦除，不会把校验库打进前端包。
- **不引入数据请求库和状态管理库**：页面数量少，自带能力够用，包体更小。
