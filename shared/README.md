# shared

接口契约（TypeScript + zod），前后端共同引用。

**任何改动都必须先经店主同意。** 流程见 `docs/开发约束.md` 第 2 节。

## 阶段 A 契约

- [接口一览与行为约定](../docs/api/stage-a.md)
- [OpenAPI 完整定义](../docs/api/stage-a.openapi.json)
- [请求与响应模型](./stage-a-schemas.ts)
- [路由、成功状态和错误码](./stage-a.ts)

前端 mock 与后端均可从 `index.ts` 引用 Zod schema 或 TypeScript 类型。保存商品图片时，先用上传接口取得 ID，再把 ID 放进商品的新增或修改请求。前台只使用接口返回的图片路径。

前台通过 `GET /api/shop` 读取店铺资料。两端的分类列表均一次返回全部匹配分类。商品品牌和型号在新增时可省略，读取时空值为 `""`。图片接收 JPEG、PNG、WebP，单张 10 MiB、最多 2400 万像素，缩略图长边 480 像素。前端将 HEIC 转为 JPEG 并压缩后再上传。

## 阶段 B 契约草案

- [接口一览与行为约定](../docs/api/stage-b.md)
- [OpenAPI 完整定义](../docs/api/stage-b.openapi.json)
- [请求与响应模型](./stage-b-schemas.ts)
- [路由、成功状态和错误码](./stage-b.ts)

## 本地验证

使用 Node.js 24 或更高版本，在仓库根目录运行：

```sh
npm --prefix shared ci
npm --prefix shared run typecheck
npm --prefix shared run docs:check
```

契约获准变更后，运行 `npm --prefix shared run docs` 重新生成各阶段的接口文档。
