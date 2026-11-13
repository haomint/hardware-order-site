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

## 假数据与真实后端

默认使用 `src/api/mock.ts` 的假数据，不需要后端。假数据的结构来自 `shared/` 契约，行为按 `docs/api/stage-a.md` 模拟。

后端就绪后，复制 `.env.example` 为 `.env.local`，把 `VITE_USE_MOCK` 改为 `false`。开发服务器会把 `/api` 和 `/uploads` 转发给后端，浏览器看到的是同源请求。

`public/uploads/mock/` 里的图片只是占位图，不是真实商品照片。

## 目录

| 位置 | 内容 |
|---|---|
| `src/index.css` | 设计变量（颜色、圆角）。调整整体风格只改这里 |
| `src/api/` | 数据请求。`index.ts` 是唯一入口，`http.ts` 请求真实后端，`mock.ts` 是假数据 |
| `src/lib/` | 购物车（本机存储）、店铺资料、金额格式化等 |
| `src/components/` | 商品卡片、价格、提示等通用部件 |
| `src/pages/` | 商城页面：首页 `Home.tsx`、商品详情 `ProductDetail.tsx` |
| `src/admin/` | 后台页面，单独打包、按需加载：登录、商品列表与编辑、分类管理 |
| `src/lib/image.ts` | 上传前把照片缩小到长边 1600 像素并转成 JPEG（含苹果手机的 HEIC 照片） |

## 当前进度（阶段 A）

- 商城：首页（搜索、分类、商品列表）、商品详情页。
- 后台（地址 `/admin`）：登录与退出、商品列表（搜索、按上架/下架/缺货筛选）、新增与编辑商品（图片上传、价格面议、缺货、置顶、排序）、删除商品、分类的增删改。
- 购物车：已能加入并保存在本机，购物车页面和提交订货单属于阶段 B。
- 订单管理：阶段 B。

假数据模式下后台的演示账号是 `admin` / `demo1234`，登录页上也会显示。这个账号只在假数据里有效，真实后端的管理员账号由部署时设置。

## 技术选择说明

- **Tailwind CSS 用 3.x 而不是 4.x**：4.x 要求 iOS 16.4 以上，会把仍在使用的旧 iPhone 挡在外面。
- **数据类型只做类型引用**：从 `shared/` 引入的是类型，构建时被擦除，不会把校验库打进前端包。
- **不引入数据请求库和状态管理库**：页面数量少，自带能力够用，包体更小。
