# Plum Admin

Plum 内部管理后台。M1 飞书登录、两角色 RBAC、后台成员管理和 Plum Admin Identity 已完成生产交付；Character/Work/Creator/User Membership 与 Overview 只读纵向切片已经完成，等待生产部署和只读 UAT。

## 当前状态

已完成管理前端工程基础、开发环境 Mock Identity、飞书 OAuth 授权码流程 + PKCE、签名 HttpOnly Session、两角色 Capability、显式路径白名单 BFF、CSRF 防护和基础后台界面。

M1 身份链路已于 2026-08-30 在 `admin.plum.top` 完成真实飞书登录、Operator 自注册和首位 Admin 验证。
一期是纯只读业务范围，生产业务写开关始终保持关闭。官方角色及其他业务写能力已移至后续，需重新确认需求和安全设计后单独立项。

生产 Remote 模式只显示已经有真实后端 API 的模块：真实指标工作台、Character/Work/Creator/User，以及仅 Admin 可见的后台成员。Subscription 和通用 Audit 页面仅保留为非生产 Fixture 原型，不属于一期。已交付列表支持详情、筛选和绑定筛选条件的 Cursor 分页；运行时响应校验会拒绝 Prompt、Greeting、Intro、`content_json`、Subscription、Wallet、完整手机号和邮箱等私有信息。

新机器安装、配置、首位 Admin、监控和回滚步骤见
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)。

## 本地启动

需要 Node.js 22 和 npm 10；版本约束与 CI 保持一致。

```bash
nvm use
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

打开 `http://localhost:3001`，选择 Operator 或 Admin 模拟身份。

本地生成文件集中在两个隐藏目录：`.cache/` 保存 Next.js 和 TypeScript 可重建缓存，`.artifacts/` 保存 Playwright 运行产物。停止开发或测试服务后，使用 `npm run clean` 可同时清除当前目录和旧版根目录中的生成内容。`node_modules/`、`.env` 和 Next.js 管理的 `next-env.d.ts` 按工具约定保留在项目根目录。

Mock 登录仅在 `NODE_ENV` 不是 `production` 且 `ADMIN_AUTH_MODE=mock` 时启用。生产环境必须配置飞书 OAuth 和长度不少于 32 字符的 `ADMIN_SESSION_SECRET`。

飞书登录使用授权码流程、随机 `state` 和 S256 PKCE。后台仅短暂使用飞书 access token 获取 `open_id`，回调结束即丢弃；不请求 `offline_access`，也不需要配置 `auth:user_access_token:read`。`open_id` 是后台成员的稳定主身份，企业邮箱不是前置条件。

## 数据源

- `ADMIN_DATA_SOURCE=fixture`：仅用于非生产开发和自动测试，提供验收文档中的确定性样例。
- `ADMIN_DATA_SOURCE=remote`：通过服务端调用部署后的 Admin API；本地开发拒绝 loopback 地址并要求 HTTPS。
- `ADMIN_API_WRITE_ENABLED=false`：默认阻止所有远端写请求；开放写操作前必须显式改为 `true`。

浏览器不会直接访问远端 API。单元测试和 CI Fixture 测试也不会连接线上服务。

## 代码组织

- `app/` 只负责 Next.js 路由、Layout 和 Route Handler；后台业务 URL 使用显式目录，不使用业务 catch-all。
- `features/` 按后台能力和业务域组织页面、组件与列表定义；每个资源模块维护自己的列、状态和展示映射。
- `features/admin-sections/` 统一处理列表鉴权、查询参数、分页、空态和错误态。
- `contracts/` 保存从后端同步的 Plum Admin OpenAPI 快照及自动生成的 TypeScript 类型；生成文件不手改。
- `features/admin-resources/` 保存数据源、Fixture 和运行时响应 Guard，并引用生成类型约束已交付资源。
- `lib/` 只放 Auth、BFF 和服务端基础设施，不反向依赖 `features/` 或 `app/`。

依赖方向固定为 `app -> features -> lib`，架构测试会阻止反向引用。

## API 契约

后端仓库的 `docs/products/plum/openapi/admin_v1.json` 是权威来源。本仓库提交其逐字节副本
`contracts/plum-admin-v1.openapi.json`，并由 `openapi-typescript` 生成
`contracts/generated/admin-api.ts`。同步后执行：

```bash
npm run contract:generate
npm run contract:check
```

`contract:check` 已纳入 `npm run verify`，生成类型过期会直接失败。当前快照包含 M1 的
`session`、`me`、`admin-users`，以及已交付的 `characters`、`character versions`、`works`、
`creators`、`users` 和 `overview` 只读操作；后端新增路径时必须先显式加入 Admin 契约，再同步快照和生成类型。
生成类型负责编译期漂移，现有运行时 Guard 继续拒绝不可信远端响应。

## 权限

| Capability | Operator | Admin |
| --- | --- | --- |
| `operations.access` | 是 | 是 |
| `character.restore` | 否 | 是 |
| `membership.manage` | 否 | 是 |
| `staff.manage` | 否 | 是 |

## 质量门禁

```bash
npm run verify
```

`verify` 依次执行 Lint、Typecheck、单元测试、生产构建和 Playwright E2E。

需求和实现边界见 [`docs/`](./docs/)。
