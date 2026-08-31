# Plum 管理后台一期开发计划

- 文档版本：v2.2
- 更新时间：2026-08-31
- 状态：纯只读一期代码已完成，等待生产部署和 UAT 收口
- 关联文档：[PRD](./PRD.md) · [技术设计](./TECHNICAL_DESIGN.md) · [验收样例](./ACCEPTANCE_SAMPLES.md) · [部署说明](./DEPLOYMENT.md)

## 1. 一期目标与边界

一期以“内部人员能安全登录并查询 Plum 核心对象”为完成标准，不包含业务数据写操作。

一期包含：

- 飞书登录自注册、禁用员工、Admin/Operator 两角色 RBAC。
- 后台成员管理，仅 Admin 可用。
- Character、Version、Work/草稿、Creator 的列表和详情，只读。
- User 与 Plum Membership 的列表和详情，只读。
- 精简 Overview，只聚合一期只读数据。
- 契约门禁、隔离数据库测试、桌面/窄屏 E2E、线上 UAT 和文档收口。

以下保留在 PRD 和技术设计中，但不属于一期开发、导航、API 承诺或退出条件：

- 官方角色创建、媒体上传、草稿保存、审核提交和发布。
- 官方角色或其他业务写操作的审计；通用审计查询工作台。
- 运营活动。
- Subscription、Wallet、Ledger、支付、退款和续费。
- Character 下架/恢复。
- Creator 限制/恢复/内部备注。
- Plum Membership 禁用/恢复。
- 独立审核工作台、Tag、Badge、Feed 排序、导入导出和普通明文访问。
- 新建备份基础设施和恢复演练。

一期除后台成员管理外不增加业务写接口。前后端业务写开关在整个一期保持 `false`，不准备 Official Owner，不执行写操作 UAT，也不为后续能力预建空接口、空页面或生产导航。

“官方角色移出一期”指不交付 Official 专项模块和写流程；现有 Character/Work 数据中的 `official` 来源值仍可在通用只读列表中自然展示，不提供专属导航、筛选承诺或操作入口。

## 2. 固定架构原则

1. 浏览器只访问 `plum_admin` 同源页面和 BFF，不持有 `PLUM_ADMIN_BFF_TOKEN`。
2. `plum_admin` 只通过 HTTPS 或同机内部 API 与 FastAPI 后端交互，不连接数据库。
3. 后端是三个产品的共享服务；所有查询固定 Plum 产品边界，不能改变其他产品路由或数据。
4. 自动测试使用 PostgreSQL 16 临时数据库和确定性合成 Fixture，不访问开发库或生产库。
5. 本地真实联调不启动或依赖本地后端；人工联调目标是已部署的 `https://admin.plum.top`。
6. 不通过临时 SQL、生产 Seed 或生产写接口准备验收数据；真实数据不足时使用空态验收。
7. OpenAPI 以 `ai4all_bridge/docs/products/plum/openapi/admin_v1.json` 为权威，前端提交逐字节快照和生成类型。
8. 一期生产配置保持 `PLUM_ADMIN_WRITES_ENABLED=false` 和 `ADMIN_API_WRITE_ENABLED=false`。

## 3. 一期 API 清单

| 模块 | 方法 | 路径 | 状态 |
| --- | --- | --- | --- |
| 身份 | POST | `/admin/plum/session` | 已生产交付 |
| 身份 | GET | `/admin/plum/me` | 已生产交付 |
| 后台成员 | GET/PATCH | `/admin/plum/admin-users...` | 已生产交付 |
| Character | GET | `/admin/plum/characters` | 已合入，待生产 UAT |
| Character | GET | `/admin/plum/characters/{id}` | 已合入，待生产 UAT |
| Version | GET | `/admin/plum/characters/{id}/versions` | 已合入，待生产 UAT |
| Work | GET | `/admin/plum/works` | 已合入，待生产 UAT |
| Work | GET | `/admin/plum/works/{id}` | 已合入，待生产 UAT |
| Creator | GET | `/admin/plum/creators` | 已合入，待生产 UAT |
| Creator | GET | `/admin/plum/creators/{id}` | 已合入，待生产 UAT |
| User | GET | `/admin/plum/users` | 已合入，待生产 UAT |
| User | GET | `/admin/plum/users/{id}` | 已合入，待生产 UAT |
| Overview | GET | `/admin/plum/overview` | 代码完成，待生产 UAT |

Official、Subscription、治理、Wallet、Moderation、Taxonomy、审计查询和导出路由均不属于一期 API 清单，不得作为一期生产能力开放。

## 4. 已完成里程碑

### M0 契约与工程地基：完成

- 独立 `plum_admin` 仓库、Next.js 16.3、Node 22 和 CI。
- `app -> features -> lib` 依赖规则和架构测试。
- 显式业务路由和 BFF Allowlist，无任意 Admin 代理。
- 本地生成内容集中在 `.cache/` 和 `.artifacts/`。
- 后端权威 OpenAPI、前端快照、类型生成和漂移门禁。
- 统一 API 错误、Keyset Cursor 和 UTC 时间契约。

### M1 身份、RBAC 和后台成员：生产完成

- 飞书 OAuth v2、随机 state、S256 PKCE、签名 HttpOnly Session。
- 飞书应用可用范围作为外部准入边界，首次登录自注册 Active Operator。
- Admin/Operator、首位 Admin Bootstrap、后台成员禁用/恢复。
- Plum 专属 BFF Token 和 `plum_admin_users`，不复用其他产品后台身份。
- 已在 `admin.plum.top` 完成真实飞书登录和生产验收。

### M2-A Character/Work 只读：已合入，待生产 UAT

- 后端列表、详情、版本、筛选绑定 Cursor、OpenAPI 和隔离测试。
- 前端 Remote 列表/详情、筛选、分页、运行时私密字段拒绝和 E2E。
- 不提供创建、编辑、提交、发布、下架或恢复入口。

### M2-B Creator 只读：已合入，待生产 UAT

- 后端列表、详情、作品聚合、跨产品隔离和无 N+1 门禁。
- 前端列表/详情、作品关联、桌面和窄屏 E2E。
- Creator Control、内部备注和治理数据库变更不在一期。

### M2-C User/Membership 只读：已合入，待生产 UAT

- 后端 API 固定 `product_memberships.app_id='plum'`，支持搜索、状态、时间、排序和筛选绑定 Cursor。
- 仅返回平台用户 ID、公开显示名、脱敏登录标识、Membership、作品摘要和时间。
- 不返回 Subscription、Wallet、Ledger、聊天、Prompt、Persona、记忆、完整邮箱或手机号。
- 前端 Remote 列表/详情、Creator/Character/Work 关联、运行时敏感字段拒绝和桌面/窄屏 E2E 已完成。
- 两仓库 CI 已通过；生产部署和真实数据 UAT 尚待完成。

## 5. 代码完成与剩余里程碑

### M2-D 范围收紧与精简 Overview：代码完成，待生产 UAT

范围收紧：

- 删除 BFF Allowlist 中 Official、Character 治理、Creator Control 和 Membership 管理等一期外业务写路径预留。
- 保留已交付的后台成员管理 PATCH；生产业务写开关继续保持关闭。
- 测试断言一期外写路径返回不允许代理，生产导航和页面不存在对应操作入口。

展示指标：

- Active Plum Membership 数量。
- Active Public Character 数量。
- Creator 数量。
- 近 7 日更新的 Work 数量。

可选展示最近更新的 Character/Work 只读摘要；不展示官方角色操作、待审核事项或写操作审计。

实现与退出条件：

- 依赖 M2-C 的 User/Membership 口径和现有 Character/Work/Creator 查询。
- 后端用有限、可解释的聚合查询返回一个只读投影；前端不拼接按行请求。
- 每个指标写明口径和时间区间；数据不足返回空态，不使用模拟数字。
- 更新 OpenAPI、前端快照和生成类型，补充 Allowlist、PostgreSQL 聚合测试及桌面/窄屏 E2E。

完成结果：

- `/admin/plum/overview` 通过单次数据库往返返回四个指标、滚动七日起止时间和 `Asia/Shanghai` 口径。
- 前端使用生成类型和运行时 Guard，Fixture 与 Remote 共用同一展示模型。
- BFF 已移除 Official、治理、Subscription、Audit 等一期外路由；后台成员管理仍是唯一一期写入口。
- 后端 Overview/OpenAPI 及既有只读聚焦测试 21 项通过；前端 39 项单元测试、8 项桌面/移动端 E2E、类型检查、Lint、契约检查和生产构建通过。

### M3 一期收口：待完成

任务：

1. 部署并完成 M2-A/B/C/D 的真实飞书 Admin/Operator 只读 UAT。
2. 验证跨产品隔离、脱敏、空态、分页、错误态和 RBAC。
3. 确认生产业务写开关保持关闭，后续模块没有生产导航或可用 API 承诺。
4. 回归 `https://plum.top` 和后端其他两个产品的既有路由。
5. 记录前后端部署 SHA、回滚 SHA、UAT 结果和遗留问题。
6. 同步 PRD、技术设计、验收样例、README 和部署说明的最终状态。

一期退出条件：

- M1 在生产稳定运行。
- M2-A/B/C/D 已部署并通过真实飞书 Operator/Admin 只读 UAT。
- User 查询固定 Plum Membership，完整身份、私有正文和其他产品数据不可见。
- Operator 不能管理后台成员；Admin 成员管理和最后一个 Active Admin 保护正常。
- `https://plum.top` 正常，后端其他两个产品的路由与测试不变。
- 两个业务写开关均为 `false`。
- Official、Subscription、治理、审计工作台和备份演练等后续能力未被隐式开放。

## 6. 测试与数据策略

### 自动化

- 后端：PostgreSQL 16 临时集群、完整 Migration 链、固定合成 Fixture。
- 前端：本地 Fixture 或请求 Mock，不连接线上后端。
- 契约：后端导出 OpenAPI，前端快照逐字节一致，生成类型无漂移。
- E2E：Operator/Admin/Disabled、桌面和窄屏、Loading/Empty/Error/Forbidden。

### 禁止事项

- 不从测试读取开发机数据库或生产数据库。
- 不调用生产写接口准备 Fixture。
- 不把生产 Token、Cookie、用户标识或真实内容写入快照。
- 不在生产导入 `accept_` 测试 ID。
- 不通过 Offset 分页或浏览器端全量过滤绕过服务端查询。

## 7. 发布顺序

每条只读纵向切片按以下顺序交付：

1. 后端实现、隔离测试、OpenAPI 更新。
2. 前端同步契约、实现页面、单元和 E2E。
3. 两仓库各自 PR、CI、人工合并。
4. AWS 记录当前生产 SHA，后端先部署。
5. 后端 readiness 和内部鉴权冒烟通过后，前端再部署。
6. 真实飞书账号执行 UAT，记录已部署 SHA 和结果。
7. 确认业务写开关始终关闭。

## 8. 需要用户或 AWS 配合的事项

### 当前只读部署

- AWS Agent 记录现有生产 SHA，更新两个仓库 `main`，后端先、前端后部署。
- 用户使用真实飞书 Operator/Admin 完成 Character、Work、Creator、User/Membership 只读 UAT。
- AWS Agent 不修改生产数据库、不补造业务数据，只在真实数据不足时报告空态。

### 本次完整只读部署

- AWS Agent 在合并后按后端先、前端后的顺序部署包含 Overview 的完整一期只读提交。
- 用户核对四项指标口径和真实数据表现，不要求通过临时 SQL 人工对数。

### 不需要在一期提供

- `Plum Official` 平台用户 ID、Public Profile、角色表单、媒体限制或专用写 UAT 对象。
- Subscription 口径和支付业务设计。
- 治理状态机、通用审计、Admin 审批或备份恢复演练。
- 运营活动、钱包、审核工作台和导入导出方案。

## 9. 下一步顺序

1. 提交并合并 M2-D 前后端改动。
2. 部署 M2-A/B/C/D 完整一期只读版本并完成 Admin/Operator UAT。
3. 执行 M3 主站/多产品回归，记录部署 SHA、回滚 SHA 和 UAT 结果。
4. 一期结束；官方角色等后续能力重新确认需求后单独立项。
