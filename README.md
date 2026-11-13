# 五金订货网站

面向实体五金店熟客的手机网页：客户自己看商品、选好后提交订货单；店主在手机上收到提醒，进后台查看和处理订单。**网站不处理支付**，金额和收款由店主联系客户确认。

完整需求见 [产品需求文档（PRD）](hardware_order_prd_v1.md)。

## 进度

开发分三个阶段，每个阶段对应一个[里程碑](https://github.com/haomint/hardware-order-site/milestones)，里面的 issue 就是要做的全部事情。

| 阶段 | 目标 | 交付 |
|---|---|---|
| A：商品可浏览 | 客户能看商品，店主能管理商品 | 商城首页、商品详情、后台商品与分类管理 |
| B：订单可闭环 | 客户能下单，店主能处理订单 | 购物车、提交订货单、后台订单管理 |
| C：通知与上线 | 新订单提醒到手机，正式对外开放 | 企业微信提醒、部署、HTTPS、异地备份、监控 |

## 怎么协作

两个 AI 分工开发，店主负责定需求和验收：

| 负责方 | 范围 | 目录 |
|---|---|---|
| Claude | 前端：商城和后台的全部页面 | `web/` |
| Codex | 后端：接口、数据库、通知、部署脚本 | `server/` |
| 双方共用，改动需店主同意 | 接口契约 | `shared/`、`docs/api/` |
| 店主 | 需求、验收、域名备案等非开发事项 | 根目录、`docs/` |

**所有开发都从 issue 开始**：一个 issue 只做一件事，写明「要做什么」和「验收标准」；一个 issue 对应一个分支和一个 PR；自动检查通过、店主合并 PR，就算验收通过。哪一步出了问题，从 issue 就能查到。详细规则见 [开发约束](docs/开发约束.md) 第 6 节。

## 目录

```
hardware_order_prd_v1.md   产品需求文档（另有 Word 版）
docs/开发约束.md            协作规则与技术约束
docs/api/                  接口文档（由 shared/ 自动生成）
shared/                    接口契约（TypeScript + zod）
web/                       前端，说明见 web/README.md
server/                    后端，说明见 server/README.md
CLAUDE.md / AGENTS.md      分别给 Claude 和 Codex 的工作说明
```

## 本地运行

需要 Node.js 24 或更高版本。

只看前端效果（使用假数据，不需要后端）：

```sh
npm --prefix shared ci
npm --prefix web ci
npm --prefix web run dev
```

浏览器打开 `http://localhost:5173`，后台在 `/admin`，假数据模式的演示账号会显示在登录页上。

接真实后端的步骤见 [server/README.md](server/README.md) 和 [web/README.md](web/README.md)。

## 自动检查

每个 PR 和每次合并到 `main` 都会自动运行检查（GitHub 的 Actions 页面可看结果）：契约类型检查与文档一致性、前端类型检查与构建、后端类型检查与自动化测试。检查分三项，哪一项失败就是哪一部分出了问题。
