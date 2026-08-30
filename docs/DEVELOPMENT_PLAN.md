# Plum 管理后台一期详细开发计划

- 文档版本：v1.1
- 文档状态：已确认；实施中
- 更新时间：2026-08-30
- 关联 PRD：[Plum 管理后台产品需求文档](./PRD.md)
- 关联技术设计：[Plum 管理后台技术设计](./TECHNICAL_DESIGN.md)
- 验收输入：[Plum 管理后台验收样例](./ACCEPTANCE_SAMPLES.md)

## 1. 一期基线

已冻结范围：

- 包含员工登录、工作台一期指标、Character、Work/草稿、创作者、用户、Subscription 只读、审计和后台成员。
- 包含官方角色表单创建、媒体上传、草稿保存、提交现有审核链路和发布。
- 包含角色下架/恢复、创作者限制/恢复、Plum Membership 管理和一期写操作审计。
- 官方角色只支持表单创建，不支持批量导入。
- 无运营活动。
- 无 Wallet/Ledger、支付、退款、续费和余额操作。
- 无独立审核工作台、人工领取任务或审核决策页面。
- 无标签、Badge 和 Feed 排序管理。
- 无普通明文访问入口。
- 角色下架允许 Operator；角色恢复仅允许 Admin。
- 员工登录使用飞书 OAuth v3、随机 state 和 S256 PKCE，以 `open_id` 为稳定身份，邮箱允许为空。
- 飞书应用可用范围仅包含产品、运营和管理人员；范围内成员首次登录自注册为 Active Operator，Admin 只能受控授予。
- Admin 可以按指定 `open_id` 禁用或恢复成员，禁用对已有会话的后续请求立即生效。
- 生产域名使用 `admin.plum.top`。
- RBAC 仅包含 Operator 和 Admin；一期不建设通用审批流。

### 1.1 实施原则

- `plum_admin` 只通过服务端 BFF 调用 `weixin_bot` 的版本化 Admin API，不直连数据库、不导入后端代码。
- 两个仓库独立构建、独立发布；后端兼容 API 先上线，前端随后接入。
- 本地真实联调不连接本地后端常驻服务；部署后的 HTTPS Admin API 才是人工联调目标。
- 自动化测试不访问线上，也不信任开发机现有 PostgreSQL 数据。
- 一期后端测试使用完整 Migration 链创建的临时 PostgreSQL，并用确定性合成 Fixture 补齐数据。
- 远端写操作默认关闭；只读 UAT、备份恢复检查和专用验收对象准备完成后才允许逐项开启。
- 不因一期暂缓而删除长期 PRD 和技术设计，但后续能力不得进入一期路由 Allowlist、导航或退出条件。

### 1.2 一期 API 清单

| 能力组 | Method | Path | 权限 | 阶段 |
| --- | --- | --- | --- | --- |
| 身份 | POST | `/admin/plum/session` | Valid BFF + Feishu identity | M1 |
| 身份 | GET | `/admin/plum/me` | Active member | M1 |
| 工作台 | GET | `/admin/plum/overview` | `operations.access` | M2 |
| Character | GET | `/admin/plum/characters` | `operations.access` | M2 |
| Character | GET | `/admin/plum/characters/{id}` | `operations.access` | M2 |
| Character | GET | `/admin/plum/characters/{id}/versions` | `operations.access` | M2 |
| Work/草稿 | GET | `/admin/plum/works` | `operations.access` | M2 |
| Work/草稿 | GET | `/admin/plum/works/{id}` | `operations.access` | M2 |
| 创作者 | GET | `/admin/plum/creators` | `operations.access` | M2 |
| 创作者 | GET | `/admin/plum/creators/{id}` | `operations.access` | M2 |
| 用户 | GET | `/admin/plum/users` | `operations.access` | M2 |
| 用户 | GET | `/admin/plum/users/{id}` | `operations.access` | M2 |
| 订阅 | GET | `/admin/plum/subscriptions` | `operations.access` | M2 |
| 审计 | GET | `/admin/plum/audit-events` | `operations.access` | M2 |
| 后台成员 | GET | `/admin/plum/admin-users` | `operations.access` | M2 |
| 后台成员 | PATCH | `/admin/plum/admin-users/{open_id}` | `staff.manage` | M5 |
| 官方媒体 | POST | `/admin/plum/official/media/uploads` | `operations.access` | M4 |
| 官方 Work | POST | `/admin/plum/official/works` | `operations.access` | M4 |
| 官方 Work | PATCH | `/admin/plum/official/works/{id}` | `operations.access` | M4 |
| 官方发布 | POST | `/admin/plum/official/works/{id}/submit` | `operations.access` | M4 |
| 创作者治理 | PATCH | `/admin/plum/creators/{id}/control` | `operations.access` | M5 |
| 角色治理 | POST | `/admin/plum/characters/{id}/takedown` | `operations.access` | M5 |
| 角色治理 | POST | `/admin/plum/characters/{id}/restore` | `character.restore` | M5 |
| Membership | POST | `/admin/plum/users/{id}/membership/disable` | `membership.manage` | M5 |
| Membership | POST | `/admin/plum/users/{id}/membership/enable` | `membership.manage` | M5 |

不在本表中的 `/admin/*` 路由不因一期后台而自动开放。Wallet、Ledger、Moderation、Tag、Badge、Feed 排序和导出接口均不进入一期。

### 1.3 当前仓库基线

截至 2026-08-30：

- `plum_admin` 当前开发分支为 `codex/phase1-admin`，身份基础提交为 `b36200e`；本轮员工自注册与禁用能力已完成并通过本地验收。
- `ai4all_bridge` 当前开发分支为 `codex/phase1-admin-api`，身份 API 基础提交为 `964685d`；本轮员工目录与治理能力已完成并通过隔离数据库验收。
- 线上后端已由运维切换到 `main`，旧未跟踪探查脚本已删除；正式部署仍必须使用评审后的不可变 Commit SHA。
- 本轮已获授权创建本地 Commit；Push 或创建 PR 仍需明确授权。

## 2. 前置依赖总表

### 2.1 已完成

| 依赖 | 状态 | 产物 |
| --- | --- | --- |
| GitHub 仓库 | 完成 | `huanshanxiaoyao/plum_admin` |
| 本地 Git 初始化和远端关联 | 完成 | `main` + `origin` |
| PRD | 完成 | `docs/PRD.md` |
| 技术设计 | 完成 | `docs/TECHNICAL_DESIGN.md` |
| 一期范围冻结 | 完成 | PRD §3、§12 和本文 §1 |
| 六项业务决策 | 完成 | PRD §12 |
| RBAC 权限矩阵 | 完成 | PRD §4.3、技术设计 §6.3 |
| API 错误、分页、时间契约 | 完成 | 技术设计 §8.1 |
| 验收样例 | 完成 | `docs/ACCEPTANCE_SAMPLES.md` |

### 2.2 M1 开工前

| 依赖 | Owner | 要求 | 阻塞项 |
| --- | --- | --- | --- |
| Node.js/npm 版本 | 工程 | 与 `plum_chat` 生产版本兼容，并在 CI 固定 | 工程构建 |
| 后端隔离测试环境 | 工程 | `pytest-postgresql` 可启动，完整 Migration 模板和每测试数据库克隆可用 | 后端自动化测试 |
| 飞书应用方案 | 产品/工程 | 已发布；本地与生产 Callback 已配置 | 已完成 |
| 首个后台 Admin | 产品/运维 | 使用已确认的 Jack `open_id` 执行一次性 Bootstrap；其他成员登录自注册 | RBAC UAT |
| 官方创作者账号规格 | 产品 | 名称、Handle、头像和公开展示文案 | 官方角色流程 |
| `plum_admin` 初始 Commit | 用户/工程 | 初始提交 `922e4f9` | 已完成 |

飞书 OAuth 基础实现已完成；无需继续人工收集 Operator `open_id`。开发机现有数据库不作为 M1 或后续里程碑的验收输入。

### 2.3 M2/M3 联调前

| 依赖 | Owner | 要求 | 阻塞项 |
| --- | --- | --- | --- |
| Admin API 分支协作 | 后端 | `ai4all_bridge` 可创建开发分支并运行 Plum 聚焦测试 | 真实数据接入 |
| OpenAPI 契约导出 | 后端 | 新 Admin API 出现在产品 OpenAPI 中 | 前后端契约校验 |
| 脱敏规则确认 | 产品/安全 | 邮箱、手机号和内部备注展示规则确认；默认方案为双方角色均脱敏 | 用户页面 |
| 指标口径 | 产品/数据 | 新增、活跃、创作者和订阅分布口径确认；不含待审核指标 | 工作台 |
| 验收 Fixture Helper | 后端 | 仅向 pytest 临时 PostgreSQL 幂等创建合成样例，不成为生产 Seed | Contract/E2E |
| 契约快照 | 前后端 | 后端 OpenAPI 与前端类型/Fixture 对齐并纳入差异检查 | 真实数据接入 |

### 2.4 生产部署前

| 依赖 | Owner | 要求 | 阻塞项 |
| --- | --- | --- | --- |
| 飞书 OAuth 凭据 | 飞书应用管理员 | 应用已发布且两个 Redirect URI 已配置；生产 Secret 仍需安全写入 aws-sg | 生产登录 |
| DNS | 域名管理员 | `admin.plum.top` 指向 aws-sg | 公网访问 |
| TLS | 运维 | `admin.plum.top` 有效证书和自动续期 | HTTPS |
| systemd/nginx 权限 | 运维 | 可安装用户级服务和 nginx vhost | 服务上线 |
| 生产 Secrets | 运维 | 独立 BFF Token、Session Secret、OAuth Secret | 服务启动 |
| Plum Official 账号 | 产品/后端 | Active User、Membership、Profile，ID 写入生产配置 | 官方角色上传 |
| 首个 Admin Bootstrap | Admin/运维 | Jack 以真实 `open_id` 建立为 Active Admin；真实 ID 不写入 Git | 生产授权 |
| 异地备份 | 运维 | EBS Snapshot 或对象存储备份，并完成恢复演练 | 开放写操作 |
| 回滚方案 | 工程/运维 | 前端、后端、迁移和 nginx 均有明确回滚路径 | 发布审批 |
| 两层写开关 | 工程/运维 | 前端 `ADMIN_API_WRITE_ENABLED`、后端 `PLUM_ADMIN_WRITES_ENABLED` 默认均为 `false` | 生产写操作 |
| 专用验收对象 | 产品/后端 | 使用合成身份、官方 Work 和可恢复 Character，不选择任意真实业务记录 | 写操作 UAT |

只读后台可以先于内容写操作上线。未完成异地备份和恢复演练、专用验收对象和显式批准前，不开放官方发布、角色下架、创作者限制、Membership 或后台成员写操作。

## 3. 里程碑计划

### M0：需求与契约冻结

状态：已完成。

产物：

- PRD v0.4。
- 技术设计 v0.4。
- 一期详细开发计划 v1.0。
- RBAC 权限矩阵。
- API 通用契约。
- 验收样例和场景。

退出门槛：用户确认一期范围、API 清单、测试数据策略、上线门槛和工期；上述文档不再存在未标注的一期/后续混合项。

### M1：管理前端基础与 Admin Identity

状态：开发完成，待部署联调。`plum_admin` 前端基础、飞书 OAuth v3、Remote Identity BFF、员工列表和禁用/恢复交互已完成；后端 Plum 私有员工目录、登录自注册、按 `open_id` 禁用/恢复、最后一个 Active Admin 保护和隔离测试已完成。线上迁移、首个 Admin Bootstrap 与真实飞书登录验收待执行。

在后端仓库并行开发期间，`plum_admin` 已先完成角色、创作者、用户和订阅的本地 API Contract、确定性 Fixture 及只读列表。该工作属于 M3 前置准备，不代表 M2 真实 Admin API 或 M3 联调退出门槛已经完成。

预计：2～3 个工作日。

任务分解：

| ID | 仓库 | 任务 | 依赖 | 交付物/验证 |
| --- | --- | --- | --- | --- |
| I-01 | `ai4all_bridge` | 新增 Plum 专属 `/admin/plum/me`，保留其他产品 `/admin/me` 不变 | M0 | Route Inventory 测试；两个端点各注册一次 |
| I-02 | `ai4all_bridge` | 新增 `PLUM_ADMIN_BFF_TOKEN` 配置、恒定时间比较和冲突校验 | I-01 | 正确/缺失/错误 Token 测试 |
| I-03 | `ai4all_bridge` | 解析并校验员工 ID、规范化邮箱和 Request ID Header | I-02 | 非法 Header 返回稳定 401/422 |
| I-04 | `ai4all_bridge` | 新增 `plum_admin_users`，实现 OAuth 登录原子自注册和四个 Capability | I-03 | 首登、重登、Admin、Operator、Disabled 矩阵 |
| I-05 | `ai4all_bridge` | 实现 `/admin/plum/me` 响应和统一错误 Envelope | I-04 | Plum 新契约与其他产品旧契约隔离测试 |
| I-06 | `plum_admin` | 完成飞书 OAuth v3、state/PKCE、Provider Adapter、Callback 和 HttpOnly Session | 飞书应用方案 | 已完成；Auth 单测通过，Mock 仅开发可用 |
| I-07 | `plum_admin` | BFF 附加服务 Token、员工 Header、Request ID 和 CSRF 防护 | I-05、I-06 | 浏览器 Bundle 无服务 Token |
| I-08 | `plum_admin` | 依据 `/admin/plum/me` 渲染导航、403 和 Disabled 状态 | I-05 | 两角色 UI/路由测试 |

`plum_admin`：

- 初始化 Next.js 16、React 19 和 TypeScript。
- 配置 Lint、Typecheck、Unit Test 和 Playwright。
- 建立后台布局、导航、登录页、403、404 和 5xx 页面。
- 实现飞书 Auth Provider Adapter；开发环境允许显式 Mock Identity。
- 实现 HttpOnly Session 和 CSRF 防护。
- 实现显式路径 Allowlist 的 BFF Client。
- 根据 `/admin/plum/me` 返回的 Capability 渲染导航。

`ai4all_bridge`：

- 增加 `PLUM_ADMIN_BFF_TOKEN` 配置和冲突校验。
- 实现 BFF 服务鉴权与员工 Header 解析。
- 从 Plum 私有 `plum_admin_users` 读取状态和角色。
- 实现代码内 Capability 映射、`POST /admin/plum/session` 和 `GET /admin/plum/me`。
- 保持旧 Admin/Staff/Reviewer Token 兼容。

测试：

- Admin、Operator 两个角色的 Capability 快照。
- 首次登录创建 Operator、重复登录更新 `last_login_at`，Disabled 成员拒绝且不被登录自动恢复。
- 无 BFF Token、错误 Token 和伪造 Role Header 拒绝。
- 浏览器 Bundle 不包含服务端 Token。

退出门槛：`/admin/plum/session`、`/admin/plum/me` 契约、两角色 Capability、Disabled 拒绝、其他产品路由兼容和浏览器密钥排除测试通过；验收样例中后续 Moderation 场景不作为一期门槛。

### M2：只读 Admin API

预计：3～4 个工作日。

任务分解：

| ID | 仓库 | 任务 | 依赖 | 交付物/验证 |
| --- | --- | --- | --- | --- |
| R-01 | `ai4all_bridge` | 建立一期 Admin Router、Contracts、异常处理器和 Capability Dependency | I-05 | OpenAPI 出现一期只读路由 |
| R-02 | `ai4all_bridge` | 实现 Keyset Cursor、筛选绑定和 UTC 序列化 Helper | R-01 | API-01～API-03 |
| R-03 | `ai4all_bridge` | 实现 Character/Version/Work/草稿 Read Model | R-02 | 稳定分页、私有状态可查、无 N+1 |
| R-04 | `ai4all_bridge` | 实现 Creator Read Model 和作品摘要 | R-02 | 定义一致、聚合查询数量门禁 |
| R-05 | `ai4all_bridge` | 实现 Plum User/Membership Read Model | R-02 | 固定 `app_id=plum`、跨产品隔离 |
| R-06 | `ai4all_bridge` | 实现 Subscription Read Model | R-05 | `billing_connected=false`、无支付推断 |
| R-07 | `ai4all_bridge` | 实现一期 Overview 和 Audit Event 查询 | R-03～R-06 | 指标口径、敏感元数据排除 |
| R-08 | `ai4all_bridge` | 实现 Admin User 列表 | I-04 | 仅 `staff.manage` 可访问 |
| R-09 | `ai4all_bridge` | 新增 pytest-only 验收 Seed Helper | R-03～R-08 | 只写临时 PG；合成 ID 可重复执行 |
| R-10 | 两仓库 | 导出 OpenAPI/JSON 示例并执行契约差异检查 | R-01～R-09 | 前端类型、Fixture 与后端一致 |

后端实现：

- 工作台聚合。
- Character 列表、详情和版本。
- Work/草稿列表和详情。
- 创作者列表、详情和作品摘要。
- Plum 用户列表和详情。
- Subscription 和审计只读接口。
- 统一 Admin API 异常处理器。
- Keyset Cursor 和 UTC 时间序列化。

数据库工作：

- 检查列表查询执行计划。
- 只在实测需要时补组合索引。
- 不新增业务表。

测试：

- 跨产品隔离。
- 脱敏。
- Cursor 绑定筛选和稳定排序。
- 时间 Offset 和半开区间。
- 错误 Envelope。
- SQL 查询数量门禁。

退出门槛：API-01～API-03，以及一期用户、角色、Work/草稿、创作者、订阅、审计和成员样例全部通过；测试日志证明未连接开发机或线上数据库。

### M3：只读后台 UI

预计：3～4 个工作日，可在 M2 各资源契约稳定后按模块并行。

任务分解：

| ID | 仓库 | 任务 | 依赖 | 交付物/验证 |
| --- | --- | --- | --- | --- |
| U-01 | `plum_admin` | 将 `/admin/plum/me` 从 Mock 切换为可配置 Remote BFF | I-07 | Fixture/Remote 两种模式均可测 |
| U-02 | `plum_admin` | 接入 Overview 和统一 Loading/Empty/Error 状态 | R-07 | 无伪造指标；后端失败可恢复 |
| U-03 | `plum_admin` | 接入 Character 与 Work/草稿双视图、详情和版本 | R-03 | URL 筛选、Cursor、深链恢复 |
| U-04 | `plum_admin` | 接入 Creator 列表与详情 | R-04 | 作品摘要、状态和空态一致 |
| U-05 | `plum_admin` | 接入 User、Membership 和 Subscription 页面 | R-05、R-06 | 脱敏展示；无 Wallet 字段/入口 |
| U-06 | `plum_admin` | 接入 Audit 和 Admin User 只读页 | R-07、R-08 | Operator 看不到成员页 |
| U-07 | `plum_admin` | 固化 BFF 路径/方法 Allowlist | U-01～U-06 | 后续路由和任意代理被拒绝 |
| U-08 | `plum_admin` | 执行桌面/窄屏 Playwright 与可访问性检查 | U-02～U-07 | 无重叠、溢出和错误权限入口 |

- 工作台。
- Character 与 Work/草稿双视图。
- Character 详情和版本。
- 创作者列表与详情。
- 用户列表与详情。
- Subscription 只读视图。
- 审计查询。
- URL 筛选、分页、空态、刷新态和错误态。

测试：

- 前端 Fixture 与后端 Contract 一致性。
- Operator 全部一期只读路径和导航。
- Admin 专属入口不向 Operator 展示。
- 桌面和窄屏 Playwright 截图。
- 无文本溢出、布局重排和操作入口泄露。

退出门槛：Operator 可以完成全部一期只读验收；Admin 专属入口和后续模块不向 Operator 展示；后台停止不影响用户主站。

### M4：官方角色创建与发布

预计：3～5 个工作日。

任务分解：

| ID | 仓库 | 任务 | 依赖 | 交付物/验证 |
| --- | --- | --- | --- | --- |
| O-01 | `ai4all_bridge` | 增加并校验固定 Official Creator 配置 | I-04、Official 规格 | 缺失/非 Active/无 Plum Membership 启动或请求失败测试 |
| O-02 | `ai4all_bridge` | 用 Admin Wrapper 调用现有媒体上传内核，Owner 仅取服务端配置 | O-01 | 客户端 Owner 覆盖返回 422 |
| O-03 | `ai4all_bridge` | 用 Admin Wrapper 创建、读取和更新 Official Work/草稿 | O-01 | Revision 乐观锁、Owner 隔离 |
| O-04 | `ai4all_bridge` | 复用现有审核与发布用例，支持 Idempotency-Key | O-02、O-03 | API-04、API-05、依赖失败无半成品 |
| O-05 | `ai4all_bridge` | 为官方媒体、草稿和发布写入受控审计事件 | O-02～O-04 | 审计失败关闭；不记录 Prompt/Token |
| O-06 | `plum_admin` | 实现官方角色表单、媒体上传、保存、预览和提交状态 | O-02～O-04 | 重复点击、409、上传失败恢复 |
| O-07 | 两仓库 | 用临时 PG 和前端 Fixture 跑完整官方角色链路 | O-01～O-06 | 只产生一个 Version/Character 发布结果 |

- 配置并校验固定官方创作者账号。
- 后台官方媒体上传 Wrapper。
- 官方 Work 表单、草稿保存和预览。
- 复用现有审核和发布用例。
- Idempotency、Revision Conflict 和依赖失败处理。
- Operator/Admin Capability 与审计。

明确不做：

- JSON、Excel、TXT 或 ZIP 导入。
- Owner 选择器。
- 绕过审核直接写 Character。

退出门槛：API-04、API-05 和官方角色完整链路在隔离测试数据中通过；生产写开关仍保持关闭。

### M5：角色与创作者治理

预计：3～4 个工作日。

任务分解：

| ID | 仓库 | 任务 | 依赖 | 交付物/验证 |
| --- | --- | --- | --- | --- |
| G-01 | `ai4all_bridge` | 明确平台下架与创作者归档是否可由现有状态无歧义表达 | R-03 | 状态映射决策；必要时才设计治理字段 |
| G-02 | `ai4all_bridge` | 新增 `plum_creator_controls` Expand-First Migration 和 Repository | I-04 | 全迁移链、回滚说明、多产品兼容 |
| G-03 | `ai4all_bridge` | 在创作媒体、草稿创建/保存和发布入口统一加入 Creator Gate | G-02 | Restricted 仍可浏览/聊天，但不能创作 |
| G-04 | `ai4all_bridge` | 实现 Creator restrict/restore/note 应用服务 | G-02 | Operator/Admin 允许；原因和审计必填 |
| G-05 | `ai4all_bridge` | 实现 Character takedown/restore 应用服务 | G-01 | Operator 可下架；仅 Admin 可恢复；409 防覆盖 |
| G-06 | `ai4all_bridge` | 实现 Plum Membership disable/enable | I-04 | 仅 Admin；固定 `app_id=plum`；其他产品不变 |
| G-07 | `ai4all_bridge` | 实现 Admin User create/update 和最后一个 Active Admin 保护 | R-08 | 仅 Admin；自锁和最后管理员测试 |
| G-08 | `plum_admin` | 接入创作者、角色、Membership 和成员治理 UI | G-04～G-07 | 原因、确认、403、409 和结果刷新 |
| G-09 | 两仓库 | 执行治理契约、状态机、审计和回归测试 | G-03～G-08 | GOV-01～GOV-03、RBAC 通过 |

- Character Takedown 应用服务。
- Character Restore 应用服务，仅 Admin。
- `plum_creator_controls` 迁移和 Repository。
- 创作媒体、草稿和发布入口增加 Creator Control 门禁。
- 创作者暂停、恢复和内部备注。
- Plum Membership 禁用与恢复，仅 Admin。
- 业务变更与审计同事务。

退出门槛：GOV-01～GOV-03、一期 RBAC 和全部审计要求在临时数据库通过；Migration 不破坏旧 Writer；生产写开关仍保持关闭。

### M6：生产准备与 UAT

预计：2～3 个工作日，不含外部审批等待。

任务分解：

| ID | 环境 | 任务 | 前提 | 失败处理 |
| --- | --- | --- | --- | --- |
| P-01 | CI/本地隔离环境 | 两仓库全量相关测试、OpenAPI 差异和 Migration 链 | M1～M5 | 不进入部署 |
| P-02 | aws-sg | 部署后端兼容代码和 Expand-First Migration，写开关关闭 | P-01、备份 | Migration 失败时保留旧服务 |
| P-03 | aws-sg | 验证 readiness、鉴权、查询计划和一期只读 API | P-02 | 回滚后端版本或关闭新路由 |
| P-04 | aws-sg | 部署 `plum_admin`、nginx、TLS、健康检查和日志 | P-03 | 回滚前端；主站不受影响 |
| P-05 | 线上只读 | Admin/Operator 登录、RBAC、脱敏、分页和跨产品隔离 UAT | P-04 | 保持写开关关闭并修复 |
| P-06 | 线上准备 | 创建专用验收身份/Work/Character，确认快照可恢复 | P-05、显式批准 | 不满足则只读版本继续运行 |
| P-07 | 线上写 UAT | 先开后端、再开前端写开关，按能力逐项验证 | P-06 | 任一异常立即关闭两层写开关 |
| P-08 | 线上 | 验证审计、告警、回滚和 `plum.top` 隔离 | P-07 | 回滚前端/后端，Migration 保留兼容结构 |

- 新增 `plum-admin-frontend.service`，监听 `127.0.0.1:3001`。
- 配置 `admin.plum.top`、TLS、nginx、安全头和日志轮转。
- 加入健康检查和告警。
- 部署只读版本并完成 Admin、Operator 两角色 UAT。
- 完成异地备份和恢复演练。
- 再开放写操作并验证审计。
- 执行回滚演练。

退出门槛：一期验收样例通过，后续 Wallet/Moderation/Tag/Badge 样例明确跳过；生产主站隔离和回滚验证通过，发布检查表签字。

## 4. 测试与数据准备

### 4.1 数据来源分级

| 场景 | 数据源 | 是否允许写入 | 用途 |
| --- | --- | --- | --- |
| 后端单元/契约测试 | 每测试独立的临时 PostgreSQL | 是，测试结束销毁 | Repository、状态机、RBAC、Migration |
| 前端单元/E2E | 确定性 TypeScript Fixture | 是，仅进程内 | 页面、权限、错误和交互 |
| 跨仓库契约 | OpenAPI 快照和固定 JSON 示例 | 生成文件可更新 | 检测字段、枚举和错误格式漂移 |
| 开发机现有数据库 | 不作为测试输入 | 默认禁止测试 Seed | 仅在人工排障且明确知情时只读参考 |
| 已部署 HTTPS API | 真实线上数据 | 默认只读 | M6 登录和只读 UAT |
| 线上专用验收对象 | 合成身份和可恢复业务对象 | 审批后允许 | M6 写操作 UAT |

### 4.2 后端隔离数据库

沿用 `ai4all_bridge/tests/conftest.py` 的数据库保护：

1. 测试启动时清除环境中的 `DATABASE_URL`，避免继承开发或生产连接。
2. 使用 `pytest-postgresql` 创建临时 PostgreSQL 模板库。
3. 对模板库执行完整 Migration 链，而不是手工创建简化表。
4. 每个测试从模板克隆独立数据库，测试间不可共享业务状态。
5. `seed_plum_admin_acceptance` 只接受测试 Session/Repository，不读取运行时配置中的数据库地址。
6. Fixture 使用 `.invalid` 邮箱和 `*_accept_*` ID，禁止复制真实 PII、Token、Prompt 或聊天正文。
7. 测试结束自动销毁数据库；失败日志不得输出连接凭据或敏感正文。

需要覆盖的数据组合：

- Active Admin、首次登录 Operator、重复登录 Operator 和 Disabled 成员。
- Plum Official、Active Creator、Restricted Creator、普通 Plum User 和仅其他产品用户。
- Official/UGC、Active/Takedown/Private Character。
- Draft/Pending/Rejected/Published Work 及 Revision Conflict。
- Free/Standard/Premium Subscription 基础记录；不创建支付成功语义。
- 同一平台用户跨产品 Membership，用于验证 `app_id=plum` 隔离。

### 4.3 测试层级

| 层级 | 运行时机 | 必测内容 |
| --- | --- | --- |
| L1 单元测试 | 每个任务 | Capability、Schema、Cursor、脱敏、状态转换 |
| L2 Repository/Service | 后端 PR | 临时 PG、Migration、查询数量、事务与审计 |
| L3 API Contract | 后端 PR | ASGI/TestClient、Envelope、时间、分页、Allow/Deny |
| L4 前端测试 | 前端 PR | Fixture、BFF Allowlist、页面状态、表单和权限 |
| L5 跨仓库契约 | M2 后持续 | OpenAPI/JSON 示例与 TypeScript 类型差异 |
| L6 线上只读 UAT | P-05 | 登录、查询、脱敏、403、主站隔离 |
| L7 线上受控写 UAT | P-07 | 专用对象、审计、幂等、回滚和写开关 |

### 4.4 线上数据不足时的处理

- 列表为空是合法结果，不以“线上必须存在某类数据”作为 API 成败条件。
- 只读 UAT 使用已知 ID 时，如果资源不存在，改验收空态和 404 契约，不向任意现有用户补写数据。
- 必须验证完整写链路时，单独准备 Plum Official、验收成员、Work 和 Character；ID、用途、清理或保留策略记录在发布检查表。
- 没有 staging 时先发布只读版本。无法安全准备专用对象时，写操作 UAT 延后，不以生产真实记录替代。

## 5. 依赖关系与并行安排

```text
M0
 -> M1 Identity/RBAC
     -> M2 Read API -----> M3 Read UI
     -> Official Account -> M4 Official Creation
     -> Schema Decision --> M5 Governance
M3 + M4 + M5 + Production Prerequisites
 -> M6 UAT and Release
```

可并行：

- M1 前端壳与后端 Admin Identity。
- M2 每个资源 API 与 M3 已冻结资源的页面。
- 飞书应用、DNS/TLS、官方账号和异地备份准备。
- M4 官方角色与 M5 创作者治理在共享鉴权、审计 Helper 稳定后并行。

不可并行或必须先后：

- Capability 契约先于所有写接口。
- Read API Contract 先于对应页面真实接入。
- 数据库迁移先于依赖新表的后端版本重启。
- 异地备份和恢复演练先于生产写操作开放。

## 6. 分支与交付策略

- `plum_admin` 和 `ai4all_bridge` 分别创建同一里程碑语义的短分支。
- 前后端通过固定 JSON Contract 和验收 Fixture 对齐，不通过口头约定字段。
- 每个 PR 只覆盖一个可独立验证的能力，不把工程初始化、全量页面和生产部署堆在一个 PR。
- 后端先合并向后兼容的 API，再合并调用这些 API 的前端。
- 数据库迁移保持 Expand First；旧服务仍运行时新列和新表不破坏旧 Writer。
- 未经用户明确授权，不自动 Commit、Push 或创建 PR。

## 7. 每个里程碑 Definition of Done

- 代码通过 Lint、Typecheck 和受影响范围测试。
- API 和数据结构与技术设计一致。
- 新权限同时有 Allow 和 Deny 测试。
- 新写操作有 Idempotency/Conflict 和审计测试。
- 用户与创作者数据有跨产品、跨 Owner 隔离测试。
- 页面有 Loading、Empty、403、Conflict 和 Backend Unavailable 状态。
- 文档、环境变量模板和部署说明同步更新。
- 没有密钥、真实 PII、Prompt 或聊天正文进入日志和 Fixture。
- Git Diff 无无关格式化或生成物。

## 8. 确认点与开工顺序

### 8.1 用户确认点

| Gate | 确认内容 | 通过后允许 |
| --- | --- | --- |
| GATE-0 | 本文一期范围、API、数据策略和工期 | 创建两仓库开发分支并开始 M1 |
| GATE-1 | `/admin/plum/me`、RBAC 和 OpenAPI 契约 | M2/M3 真实数据接入 |
| GATE-2 | 官方账号规格、治理状态和 Migration | M4/M5 写能力实现 |
| GATE-3 | 只读 UAT、备份恢复、专用验收对象 | 开启线上写 UAT |
| GATE-4 | 写 UAT、审计、监控和回滚结果 | 一期正式开放 |

### 8.2 GATE-0 通过后的实际开工顺序

1. 获取 `weixin_bot` 写权限，分别检查两个仓库状态并创建 `codex/` 前缀短分支。
2. 在后端先完成 I-01 Plum 专属路由注册与兼容性测试，保持现有 `/admin/me` 不变。
3. 实现 I-02～I-05，同时在前端完成 I-06 的真实 OAuth Adapter。
4. `/admin/plum/me` 契约稳定后完成 I-07、I-08，并提交 GATE-1 评审材料。
5. 以 Character/Work 为第一条纵向切片完成 R-01～R-03、U-01～U-03。
6. 依次完成 Creator、User、Subscription、Audit、Admin User 的 Read API 和 UI。
7. 完成 OpenAPI 差异、临时 PG 和前端 E2E 后，再进入官方角色与治理写操作。
8. M4/M5 在共享鉴权、审计和写开关稳定后实施；生产部署严格执行 P-01～P-08。

### 8.3 本计划确认后仍需外部提供的事项

- 当前任务对 `/Users/suchong/workspace/ai4all/weixin_bot` 的可写权限。
- 飞书应用已发布，Callback 已配置；上线时仍需把生产凭据安全写入 aws-sg 环境文件。
- `Plum Official` 的名称、Handle、头像、展示文案和生产平台用户 ID。
- 已确认的 Jack `open_id` 用于线上一次性 Admin Bootstrap；Operator 无需预先提供 `open_id`。
- aws-sg 的部署、DNS/TLS、Secrets、备份和恢复执行权限或协作人。

## 9. 工期估算

| 里程碑 | 单人顺序估算 |
| --- | --- |
| M0 | 用户确认后完成 |
| M1 | 2～3 天 |
| M2 | 3～4 天 |
| M3 | 3～4 天 |
| M4 | 3～5 天 |
| M5 | 3～4 天 |
| M6 | 2～3 天 |

单人顺序总计约 16～23 个工作日。两名前后端工程师并行，且外部依赖按时提供时，预计 10～15 个工作日。

估算不包含飞书应用审批、DNS 变更等待、生产权限审批和备份基础设施采购时间。

## 10. 主要风险与回滚点

| 风险 | 预防 | 回滚/降级 |
| --- | --- | --- |
| 多产品后台边界混淆 | Plum 固定 `/admin/plum/*` 和独立 Token；Route Inventory 保护旧 `/admin/me` | 不挂载 Plum Admin Router，前端保持 Fixture |
| Admin 查询拖慢用户服务 | Keyset、Limit、查询数量门禁、独立超时 | 关闭 Overview/高成本字段或回滚后端 |
| 跨产品数据泄露 | Repository 固定 `app_id=plum`，加入反向样例 | 关闭 Admin 路由并轮换 BFF Token |
| 开发数据库数据不完整 | 所有断言使用临时 PG 和合成 Fixture | 不补写开发库，修复 Fixture/Migration |
| 治理状态含义不清 | G-01 先做状态语义决策，必要时 Expand-First | 保持治理写开关关闭 |
| Migration 影响其他产品 | 完整全局迁移链和旧 Writer 回归 | 应用回滚；兼容新增表/字段暂留 |
| 线上误操作 | 双写开关、原因、确认、乐观锁、专用对象 | 立即关写；使用明确恢复操作 |
| 后台故障影响主站 | 独立进程/域名；后台不是主站依赖 | 停止 `plum_admin`，保留主站服务 |
