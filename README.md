# Plum Admin

Plum 内部管理后台。当前处于 M1：飞书登录、两角色 RBAC、后台工作台和 Plum Admin Identity。

## M1 状态

已完成管理前端工程基础、开发环境 Mock Identity、飞书 OAuth v3 + PKCE、签名 HttpOnly Session、两角色 Capability、显式路径白名单 BFF、CSRF 防护和基础后台界面。

以下内容仍是 M1 的接入项；完成前不得部署生产登录：

- 将后端 M1 Commit 和前端 M1 Commit 发布到 aws-sg。
- 使用 Jack 在当前飞书应用下的 `open_id` 一次性 Bootstrap 首个 Admin；其他可用范围内成员首次登录自动注册为 Active Operator。
- 配置生产 BFF Token、Session Secret 和飞书 OAuth Secret。
- 完成飞书可用范围、Disabled、Admin/Operator 和旧业务兼容的线上只读联调验收。

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

飞书登录使用 OAuth v3 授权码流程、随机 `state` 和 S256 PKCE。后台仅短暂使用飞书 access token 获取 `open_id`，回调结束即丢弃；不请求 `offline_access`，也不需要配置 `auth:user_access_token:read`。`open_id` 是后台成员的稳定主身份，企业邮箱不是前置条件。

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
