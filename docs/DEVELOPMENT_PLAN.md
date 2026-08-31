# Plum 管理后台一期开发计划

- 文档版本：v2.0
- 更新时间：2026-08-31
- 状态：瘦身一期范围已冻结，按纵向切片交付
- 关联文档：[PRD](./PRD.md) · [技术设计](./TECHNICAL_DESIGN.md) · [验收样例](./ACCEPTANCE_SAMPLES.md) · [部署说明](./DEPLOYMENT.md)

## 1. 一期目标与边界

一期以“内部人员能安全登录、查询 Plum 核心对象、创建并发布官方角色”为完成标准。

一期包含：

- 飞书登录自注册、禁用员工、Admin/Operator 两角色 RBAC。
- 后台成员管理，仅 Admin 可用。
- Character、Version、Work/草稿、Creator 的列表和详情。
- User 与 Plum Membership 的列表和详情，只读。
- 精简 Overview。
- 官方角色表单、媒体、草稿、审核提交和发布。
- 官方角色写操作的最小审计。
- 契约门禁、隔离数据库测试、桌面/窄屏 E2E、线上 UAT。

以下保留在 PRD 和技术设计中，但不属于一期开发、导航、API 承诺或退出条件：

- 运营活动。
- Subscription、Wallet、Ledger、支付、退款和续费。
- Character 下架/恢复。
- Creator 限制/恢复/内部备注。
- Plum Membership 禁用/恢复。
- 通用审计查询工作台。
- 独立审核工作台、Tag、Badge、Feed 排序、导入导出和普通明文访问。
- 新建备份基础设施和恢复演练。

移除备份演练后，一期不执行破坏性业务治理写入。官方角色流程主要是新增型写入，但仍必须由双写开关、固定 Official Owner、专用验收对象、幂等键、Revision 乐观锁和最小审计共同保护。

## 2. 固定架构原则

1. 浏览器只访问 `plum_admin` 同源页面和 BFF，不持有 `PLUM_ADMIN_BFF_TOKEN`。
2. `plum_admin` 只通过 HTTPS 或同机内部 API 与 FastAPI 后端交互，不连接数据库。
3. 后端是三个产品的共享服务；所有新查询必须固定 Plum 产品边界，不能改变其他产品路由或数据。
4. 自动测试使用 PostgreSQL 16 临时数据库和确定性合成 Fixture，不访问开发库或生产库。
5. 本地真实联调不启动或依赖本地后端；人工联调目标是已部署的 `https://admin.plum.top`。
6. 生产写开关在只读阶段保持关闭；不得通过临时 SQL 准备业务验收数据。
7. OpenAPI 以 `ai4all_bridge/docs/products/plum/openapi/admin_v1.json` 为权威，前端提交逐字节快照和生成类型。

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
| User | GET | `/admin/plum/users` | 代码完成，待生产 UAT |
| User | GET | `/admin/plum/users/{id}` | 代码完成，待生产 UAT |
| Overview | GET | `/admin/plum/overview` | 待开发 |
| Official | POST | `/admin/plum/official/media/uploads` | 待开发 |
| Official | POST | `/admin/plum/official/works` | 待开发 |
| Official | PATCH | `/admin/plum/official/works/{id}` | 待开发 |
| Official | POST | `/admin/plum/official/works/{id}/submit` | 待开发 |

不在本表中的 Subscription、治理、Wallet、Moderation、Taxonomy 和导出路由不得加入一期 BFF Allowlist。

## 4. 当前完成情况

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
- 合入代码不等于生产完成；部署 SHA 和真实数据 UAT 仍需记录。

### M2-B Creator 只读：已合入，待生产 UAT

- 后端列表、详情、作品聚合、跨产品隔离和无 N+1 门禁。
- 前端列表/详情、作品关联、桌面和窄屏 E2E。
- Creator Control、内部备注和治理数据库变更不在一期。

## 5. 当前与剩余里程碑

### M2-C User/Membership 只读：代码完成，待生产 UAT

后端 API、Plum 隔离查询、OpenAPI、前端 Remote 列表/详情、运行时敏感字段拒绝和桌面/窄屏 E2E 均已完成。本节保留实现要求作为生产 UAT 的核对基线。

#### 后端任务

1. 定义 `UserListItem`、`UserDetail`、分页和筛选契约。
2. 查询必须从 Plum Membership 出发或等价地固定 `app_id='plum'`。
3. 返回平台用户 ID、公开显示名、脱敏登录标识、Membership 状态、作品摘要和时间。
4. 不返回 Subscription、Wallet、Ledger、聊天、Prompt、Persona、记忆、完整邮箱或手机号。
5. 支持 ID/显示名搜索、Membership 状态、注册时间 `[from,to)`、稳定排序和筛选绑定 Cursor。
6. 使用批量聚合避免按行查询，不为本切片新增业务表。
7. 更新 OpenAPI，并在临时 PostgreSQL 中验证 Plum 隔离、脱敏、分页、时间和响应字段。

#### 前端任务

1. 用 Remote User 列表替换 Fixture 原型，新增详情路由。
2. 展示 Membership 状态、作品摘要和最近活动，不显示 Subscription 或写按钮。
3. 支持 URL 可恢复的搜索、状态、日期、排序和 Cursor。
4. 从用户详情关联 Creator、Character 和 Work；不存在的关联显示稳定空态。
5. 同步 OpenAPI 快照和生成类型，增加运行时敏感字段拒绝。
6. 增加单元、架构、桌面和窄屏 E2E。

#### 依赖与退出条件

- 依赖：现有 `platform_users`、`product_memberships`、公开 Profile 和作品投影；不依赖 Subscription。
- 退出：两仓库 CI 通过；跨产品用户不可见；完整邮箱/手机号及私有正文不出现在响应、页面或日志。

### M2-D 精简 Overview

#### 展示指标

- Active Plum Membership 数量。
- Active Public Character 数量。
- Creator 数量。
- 近 7 日更新的 Work 数量。
- 最近官方角色操作数量或空态。

不计算 Subscription、收入、DAU/MAU、治理队列或 Moderation 队列。

#### 依赖与退出条件

- 依赖：M2-C 的 User/Membership 口径和现有 Character/Work/Creator 查询。
- 后端用有限、可解释的聚合查询返回一个只读投影；前端不得拼接多个按行请求。
- 每个指标写明口径和时间区间；数据不足返回空态，不使用模拟数字。

### M3 Official Character 创建与发布

#### 前置依赖

- 产品提供固定 `PLUM_OFFICIAL_CREATOR_PLATFORM_USER_ID`，该账号具有 Active Plum Membership 和 Public Profile。
- 明确第一版表单字段、媒体限制和现有 Moderation 结果的可公开错误映射。
- 准备一个只用于 UAT 的 Official 草稿命名规则和清理责任人。

#### 后端任务

1. 服务端固定 Official Owner，拒绝客户端 owner 字段。
2. 复用现有媒体所有权、Work 草稿、Moderation 和发布应用服务。
3. 保存草稿使用 Revision 乐观锁，冲突返回 `409 revision_conflict`。
4. 提交使用 `Idempotency-Key`，相同 Revision 重试返回同一发布结果。
5. 校验 Work 仅属于 Official Owner，不能编辑 UGC Work。
6. 所有写入口同时受 `PLUM_ADMIN_WRITES_ENABLED` 保护。
7. 不新增治理状态，不修改其他产品业务路径。

#### 前端任务

1. 表单、媒体上传、保存状态、预览和提交确认。
2. 草稿字段与后端契约一致，不提供 JSON/Excel/ZIP 导入。
3. 请求携带 Revision 和 Idempotency Key，处理 409、审核拒绝和服务不可用。
4. 所有写入口同时受 `ADMIN_API_WRITE_ENABLED` 保护。
5. 窄屏布局不遮挡字段、媒体预览和提交状态。

#### 退出条件

- 临时数据库测试覆盖 owner 隔离、Revision 冲突、幂等重试、审核拒绝和跨产品回归。
- 两个生产写开关默认仍为 `false`。
- AWS 只用专用 Official 对象执行写 UAT，不选择任意真实 UGC 对象。

### M4 最小审计与一期收口

#### 任务

1. Official 创建、保存、提交和发布通过统一 Audit Helper 写入不可变事件。
2. 事件包含员工、动作、对象、Request ID、结果和 UTC 时间，不包含 Token、Prompt、媒体正文或敏感身份值。
3. 一期不建设通用审计查询 API 和页面；必要的 UAT 证据由服务端受控日志或测试断言确认。
4. 完成 Read-only UAT、Official write UAT、主站回归、部署 SHA 和回滚 SHA 记录。
5. 同步 PRD、技术设计、验收样例、README 和部署说明的最终状态。

#### 一期退出条件

- M1 已生产稳定运行。
- M2-A/B/C/D 已部署并通过真实飞书 Operator/Admin 只读 UAT。
- M3 使用专用 Official 对象通过一次端到端写 UAT，重复提交不产生第二份发布结果。
- M4 审计测试通过，生产双写开关的最终状态和负责人有记录。
- `https://plum.top` 在后台发布前后均正常，其他两个产品的路由与测试不变。
- Subscription、治理、备份演练等后续能力未因一期被隐式开放。

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

每条纵向切片按以下顺序交付：

1. 后端实现、隔离测试、OpenAPI 更新。
2. 前端同步契约、实现页面、单元和 E2E。
3. 两仓库各自 PR、CI、人工合并。
4. AWS 记录当前生产 SHA，后端先部署。
5. 后端 readiness 和内部鉴权冒烟通过后，前端再部署。
6. 真实飞书账号执行 UAT，记录已部署 SHA 和结果。
7. 只读切片始终保持业务写开关关闭。

Official 写切片额外要求：固定 Official Owner 和专用对象就绪后，先短时开启后端写开关，再开启前端写开关；异常时先关闭前端、再关闭后端，并回滚代码。不得顺带开启治理写入。

## 8. 需要用户或 AWS 配合的事项

### 当前只读部署

- 用户确认并合并本轮两个仓库 PR。
- AWS Agent 记录现有生产 SHA，更新两个仓库 `main`，后端先、前端后部署。
- 用户使用真实飞书 Operator/Admin 完成 Character、Work、Creator、User/Membership 只读 UAT。

### M3 开始前

- 用户确认 `Plum Official` 对应的平台用户 ID 和 Public Profile。
- 用户确认第一版官方角色表单字段和一个专用验收角色名称。
- AWS Agent 只配置变量，不在数据库中临时改造真实用户或 UGC 数据。

### 不需要在一期完成

- Subscription 口径和支付业务设计。
- 治理状态机、Admin 审批或备份恢复演练。
- 运营活动、钱包、审核工作台和导入导出方案。

## 9. 下一步顺序

1. 已完成本次瘦身范围文档 PR。
2. 已完成 M2-C User/Membership 后端与前端纵向切片代码。
3. 部署并验收 M2-A/B/C 的只读模块，这是当前下一步。
4. 实现 M2-D 精简 Overview。
5. 用户确认 Official Owner 和表单后，实施 M3。
6. 完成 M4 最小审计和一期收口。
