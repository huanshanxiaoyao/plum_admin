# Plum Admin

Plum 内部管理后台。当前处于 M1：工程基础、Mock Identity、两角色 RBAC 和后台工作台。

## M1 状态

已完成管理前端工程基础、开发环境 Mock Identity、签名 HttpOnly Session、两角色 Capability、显式路径白名单 BFF、CSRF 防护和基础后台界面。

以下内容仍是 M1 的接入项，当前代码不能用于生产登录：

- 创建或确认飞书应用，并提供 OAuth Client、Secret 和 Redirect URI。
- 在 `ai4all_bridge` 增加独立 `ADMIN_BFF_TOKEN`、员工 Header 校验和新后台专用 `/admin/me`。
- 由后端按员工身份读取 `admin_users` 的角色和状态；不能信任前端 Session 中的角色。
- 完成真实飞书登录、Disabled/未知成员拒绝和两角色联调验收。

## 本地启动

需要 Node.js 22 和 npm 10；版本约束与 CI 保持一致。

```bash
nvm use
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

打开 `http://localhost:3001`，选择 Operator 或 Admin 模拟身份。

Mock 登录仅在 `NODE_ENV` 不是 `production` 且 `ADMIN_AUTH_MODE=mock` 时启用。生产环境必须配置飞书 OAuth 和长度不少于 32 字符的 `ADMIN_SESSION_SECRET`。

## 数据源

- `ADMIN_DATA_SOURCE=fixture`：仅用于非生产开发和自动测试，提供验收文档中的确定性样例。
- `ADMIN_DATA_SOURCE=remote`：通过服务端调用部署后的 Admin API；本地开发拒绝 loopback 地址并要求 HTTPS。
- `ADMIN_API_WRITE_ENABLED=false`：默认阻止所有远端写请求；开放写操作前必须显式改为 `true`。

浏览器不会直接访问远端 API。单元测试和 CI Fixture 测试也不会连接线上服务。

## 权限

| Capability | Operator | Admin |
| --- | --- | --- |
| `operations.access` | 是 | 是 |
| `character.restore` | 否 | 是 |
| `membership.manage` | 否 | 是 |
| `staff.manage` | 否 | 是 |

## 质量门禁

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

需求和实现边界见 [`docs/`](./docs/)。
