# Plum 角色工厂技术设计

- 状态：开发中，任务底座与管理端主流程已落地
- 范围：单角色生成、多角色生成
- 原型：[单角色](./character-factory/index.html) / [多角色](./character-factory/multi.html)

## 1. 已定规则

- 管理后台新增一级入口「角色工厂」，二级页为「单角色生成 / 多角色生成」。
- 所有后台角色复用 `operations.access`，均可查看、生成、测试和提交。
- 状态：`not_started / parsing / generating / draft / partial_failed / submitted`。
- 内容模式默认 `limited`，生成开始后不可修改。
- 外部生成调用全局并发不超过 3；单次尝试默认超时 60 秒。
- 自动重试 1 次；手动重试不限次数。
- 首期不做草稿箱、自动保存和离开页面后的恢复入口。
- 投稿字段、媒体、预检、机审、发布全部复用当前真实链路。

三个首期默认值：

- 归属：开始任务前选择一个真实 Plum 平台账号；多角色整批共用，不支持候选级改归属。
- 批量规模：默认 8，范围 1–20。后续按成本和成功率调大。
- URL 来源：只保证公开、无需登录的 HTTP(S) 页面；登录墙、强反爬、纯 JS 页面不承诺成功。

> 若目标是官方/system 角色，需要新增 owner 类型和发布链路。当前已上线投稿只支持真实 `platform_user_id`，不放进首期。

## 2. 核心方案

```mermaid
flowchart LR
    UI[Next.js 角色工厂] --> BFF[同源 Admin BFF]
    BFF --> API[FastAPI Admin API]
    API --> DB[(PostgreSQL 任务与草稿)]
    Worker[Factory Worker<br/>全局并发 3] --> DB
    Worker --> Source[网页抓取 / 图片理解]
    Worker --> Text[结构化文字生成]
    Worker --> Image[文生图 Provider]
    API --> Publish[现有草稿 / 预检 / 机审 / 发布]
    Publish --> DB
```

采用「提交任务 + 轮询」，不维持 60 秒同步请求，也不为首期引入 Redis、Celery 或 SSE。

- `POST` 创建或启动任务，立即返回 `202 + run_id`。
- 前端每 1.5 秒查询一次；页面后台化后降到 5 秒；进入终态后停止。
- PostgreSQL 保存任务、租约和尝试次数；Worker 用 `FOR UPDATE SKIP LOCKED` 领取。
- 单角色与多角色共用同一套模型。差别只是一个 Run 下有 1 个还是 N 个 Candidate。

## 3. 三层数据关系

```text
Run（一次创作意图 / 一个批次）
└── Candidate（一个稳定候选方向） × N
    ├── FactoryTask（解析、生图、生文、修改的执行记录） × N
    └── CreationDraft（真实投稿草稿） × 0..1
         └── Character（提交成功后） × 0..1
```

### Run

保存整次任务不应变化的条件：

- `kind`: `single | batch`
- `content_mode`: `limited | limitless`
- `source_type`: 单角色为 `mixed`，批量为 `url_text | text | image_text`
- `source_payload`、创作意图、语言/市场
- `owner_platform_user_id`
- `target_count`
- 创建人、状态、进度计数、提交批次 ID

单角色的 `mixed` 可同时保存候选图片、文字描述与竞品链接，三者至少一项非空；批量任务仍按三类来源单选。

### Candidate

保存候选身份和当前结论：

- Candidate ID 一经生成不改变；删除实际是标记 `rejected`。
- Agent 解析出的描述、参考图、来源依据属于 Candidate。
- 用户选择、合并、补充后，选中的 Candidate 才进入图文生成。
- 首次生成成功后链接一个真实 `plum_creation_drafts.work_id`。
- 重试保留 Candidate ID，只增加 Task attempt，避免工作台 URL 和审计漂移。

### Workbench

工作台只是 Candidate 对应 CreationDraft 的编辑视图，不复制第三份角色数据。

- 手改通过 `expected_revision` 更新真实草稿，冲突返回 `409`。
- Agent 修改先生成预览；用户点击应用后才更新草稿 revision。
- 图片修改和文字修改可以并发，但应用时都做 revision 校验。
- 对话测试固定读取一次 draft revision；草稿变化后提示重新开始测试。

这解决了多角色流程里的几个关键问题：

- 批次、候选和草稿各自只有一个事实源。
- 单个角色失败不阻塞同批其他角色。
- 批量操作改一组 Candidate，工作台只改当前 Candidate。
- 部分提交按 Candidate 独立幂等，不会重复创建已成功角色。
- 批次状态由子项汇总，不维护容易漂移的第二套布尔状态。

## 4. 状态计算

```mermaid
stateDiagram-v2
    [*] --> not_started
    not_started --> parsing: 启动来源解析
    parsing --> generating: 单角色直接生成 / 多角色确认候选
    parsing --> partial_failed: 解析失败
    generating --> draft: 所有选中项生成完成
    generating --> partial_failed: 任一选中项失败
    partial_failed --> generating: 自动或手动重试
    draft --> generating: 重生成或 Agent 修改
    draft --> submitted: 所有选中项提交成功
    partial_failed --> submitted: 放弃失败项并提交其余项
```

Run 状态按以下优先级派生：

1. 有解析任务运行：`parsing`
2. 有图文任务运行：`generating`
3. 有失败子项：`partial_failed`，包括全部失败，界面同时显示成功数
4. 所有本次选中项已提交：`submitted`
5. 其余已有完整草稿：`draft`
6. 尚未启动：`not_started`

部分角色已提交、其余仍是草稿时，Run 保持 `draft`，额外显示 `submitted / total`。

## 5. Limited / Limitless

`content_mode` 是生成策略，不是投稿评级。它由后端冻结并注入图像、文字两个 system policy block，前端不能自行拼接或覆盖。

```text
硬性平台规则（两种模式都生效）
→ 内容模式规则
→ 被标记为“不可信引用”的网页/图片解析结果
→ 运营创作意图
→ 严格输出 Schema
```

| 模式 | 图文提示词 | 投稿评级默认值 |
| --- | --- | --- |
| `limited` | 禁止裸露、显性性行为和色情化描写 | `general` |
| `limitless` | 可以按意图生成合规成人向内容；人物必须明确为成年人 | `mature`，运营可在预检前调整 |

两种模式都继续经过平台硬规则、图文机审和投稿预检。`limitless` 不是绕过审核。

Prompt、模型和策略都保存版本号：`prompt_version / policy_version / provider / model`。日志与操作审计只记这些标识、状态和错误码，不记完整来源、Prompt 或测试对话正文。

## 6. 任务执行

FactoryTask 类型：

```text
source_parse       URL 抓取与解析
image_understand   示例图理解
candidate_plan     生成候选池
text_generate      生成真实投稿文字字段
image_generate     生成角色原图
assemble_draft     建立/更新 CreationDraft
revise_text        按描述修改文字
revise_image       按描述修改图片
```

并发限制约束“外部调用”，不是角色数：一次 LLM 或生图请求各占一个槽，所有 Run 合计最多 3 个。数据库领取任务时在同一事务内检查有效租约数，避免多 Worker 各跑 3 个。

单次尝试默认 60 秒。自动重试只覆盖：

- 连接失败、超时、`429`、`5xx`
- Provider 返回空结果
- 结构化文字无法通过 Schema 校验

参数错误、内容政策拒绝、投稿字段校验失败不自动重试。首次失败后最多自动再试一次；手动重试开启新 cycle，累计次数但不设上限。

Worker 保存 provider request ID 和调用幂等键。OpenAI 成功后的本地持久化失败直接终止，避免自动再次购买图片；请求超时仍按全局规则最多自动重试一次。

## 7. 生成结果

文字 Provider 必须返回结构化对象，字段直接对齐投稿：

```text
display_name
gender: male | female | non_binary
intro
opening_scene
character_settings
example_dialogues
response_rules
tag_suggestions
rating_suggestion: general | mature
```

后端执行 Pydantic/JSON Schema 校验，再创建真实 CreationDraft。标签建议必须映射到平台 active tag ID，不能把模型自由文本直接投稿。

图片分两条路径：

- 手动上传/替换：复用现有「预签名 → 浏览器直传 → complete → image-set」。
- Provider 生图/改图：后端保存结果到现有 owner-scoped media，再创建 image-set，生成 9:16 立绘和 1:1 头像。
- 图片理解只读取 Run owner 的 `source_media_ids`；图片修改只读取任务冻结草稿中的当前立绘。两者可发送给 OpenAI，不开放任意 media ID 读取。

最终草稿只保存 `portrait_media_id / image_set_id / portrait_crop / avatar_crop`，不能拿外部图片 URL 直接投稿。

## 8. API

统一前缀：后端 `/admin/plum/character-factory`，浏览器经 `/api/admin/character-factory` 访问。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/runs` | 创建 Run，返回 `run_id` |
| `POST` | `/runs/{id}/start` | 启动解析/单角色生成 |
| `GET` | `/runs/{id}` | 聚合状态、候选、进度；供轮询 |
| `PATCH` | `/runs/{id}/candidates/{cid}` | 选择、拒绝、编辑候选方向 |
| `POST` | `/runs/{id}/generate` | 生成选中的候选 |
| `GET` | `/candidates/{cid}/draft` | 读取真实草稿和 revision |
| `PATCH` | `/candidates/{cid}/draft` | 手改草稿，要求 `expected_revision` |
| `POST` | `/candidates/{cid}/agent-revisions` | 创建图/文修改任务，先产出预览 |
| `GET` | `/candidates/{cid}/agent-revisions/{task_id}/preview-image/{side}` | 读取改图前/后预览 |
| `POST` | `/candidates/{cid}/agent-revisions/{task_id}/apply` | 应用 Agent 修改结果 |
| `GET` | `/candidates/{cid}/draft/portrait` | 读取当前草稿立绘 |
| `POST` | `/candidates/{cid}/preview-turns` | 基于指定 revision 测试一轮对话；待外部数据授权后开放 |
| `POST` | `/tasks/{task_id}/retry` | 手动重试一个失败环节 |
| `POST` | `/runs/{id}/preflight` | 调用真实投稿预检 |
| `POST` | `/runs/{id}/submit` | 提交选中且通过预检的 Candidate |

所有接口使用 `operations.access`。所有写操作继续受 `ADMIN_API_WRITE_ENABLED` 控制，并增加独立开关 `PLUM_CHARACTER_FACTORY_ENABLED` 便于灰度。

请求使用 `Idempotency-Key`；更新草稿使用 `If-Match` 或 `expected_revision`；错误统一包含 `code / message / request_id / retryable`。

## 9. 投稿映射

提交不新增第二套发布逻辑。Factory API 把 Candidate 的 CreationDraft 交给现有 `submit_creation_draft` / character import application service。

| 工厂值 | 真实投稿值 |
| --- | --- |
| Candidate ID | `row_key` |
| Run ID | 稳定 `batch_id` / 幂等来源 |
| Run owner | `default_owner_platform_user_id` |
| 草稿文字 | 六个真实文案字段 |
| Active tag 映射 | `tag_ids` |
| 内容评级 | `creator_declared_rating` |
| 草稿可见性 | `visibility`，默认 `private` |
| 生成图片集 | media、image-set 与两套 crop |

提交前必须补齐：`reason`、`adult_confirmed=true`、`rights_confirmed=true`。服务端继续执行 token budget、owner、图片规格、标签、评级、机审和发布校验。

单 Candidate 独立返回：`published / pending_review / rejected / failed`，并保存 `character_id / work_id / version_number / review_id`。这些是投稿结果，不与 Factory Run 状态混用。

## 10. 对话测试

Draft Preview Turn 的编译与响应契约已完成，路由待外部数据授权后开放。它不创建正式 Connection，不写用户记忆、关系进度或用户 Persona，也不产生线上消息。

- 输入：Candidate ID、draft revision、本轮文本、当前页面内的测试历史。
- Prompt：复用真实角色 prompt compiler 和回复模型。
- 默认：固定初始关系、无历史记忆、无用户画像。
- 首期同步返回 JSON，单次上限 60 秒；超时允许用户重试。

因此它验证的是角色口吻和基础设定，不承诺复现长期关系、记忆和用户个性化后的全部线上效果。

## 11. 前端落点

```text
app/(admin)/character-factory/page.tsx              → redirect /single
app/(admin)/character-factory/single/page.tsx
app/(admin)/character-factory/multi/page.tsx
app/(admin)/character-factory/multi/[runId]/[candidateId]/page.tsx
features/character-factory/
  factory-tabs.tsx
  single-console.tsx
  multi-console.tsx
  candidate-workbench.tsx
  reducer.ts
  contracts.ts
  api.ts
```

- 一级导航注册在 `features/admin-navigation/modules.ts`，href 为 `/character-factory`。
- 二级导航使用显式路由，不用 query 承载两条完整工作流。
- Client Component 使用 reducer 管理页面状态，不引入新的全局状态库。
- Run ID / Candidate ID 放进 URL；首期不提供历史列表和“恢复上次任务”入口。
- 生成结果与显式保存的修改必须服务端持久化，否则异步任务和工作台无法共享；“不做恢复”只指没有自动保存输入和恢复入口。
- BFF allowlist 显式加入 Factory 路径；OpenAPI 先改后端权威文件，再同步本仓库契约。

## 12. 后端落点

新增三张表：

```text
plum_character_factory_runs
plum_character_factory_candidates
plum_character_factory_tasks
```

Candidate 不重复保存完整投稿正文，只保存 `work_id`。Agent 修改预览可以暂存在对应 Task 的 `output_json`，应用后写入 CreationDraft。

优先复用：

- LLM：`agent_runtime.llm.generate_completion`，新增 Factory task tier 和严格结构化 adapter。
- URL：现有安全 web fetch/search；保持 SSRF、跳转、大小和超时限制。
- 示例图：OpenAI Responses API 多图理解，使用严格输出 Schema 和 owner 隔离。
- Worker：复用现有 image job 的 PostgreSQL lease / claim 模式。
- 草稿与提交：`creation_drafts`、prompt budget、moderation、`submit_creation_draft`。

仍需接线：Draft Preview Turn 的外部模型调用。

当前已落地：

- 管理端入口、单/多角色页面、候选工作台和完整 Fixture 验收流。
- Run / Candidate / Task 三表、权限与灰度开关。
- 创建、启动、轮询、候选编辑、批量生成、任务重试 API。
- PostgreSQL 全局 3 槽、60 秒租约、一次自动重试、手动 retry cycle。
- 严格文字输出 Schema、`Limited / Limitless` 服务端策略上下文。
- 后端权威 OpenAPI、前端生成类型与 wire adapter。
- 真实 CreationDraft 读写、revision CAS、投稿预检、机审、发布与逐候选回执。
- Agent 修改任务账本、预览 Schema、重复应用幂等和失败隔离。
- OpenAI 文生图、参考图理解和当前草稿图片修改；请求与响应均有大小上限，错误只保留稳定 code。
- 前端单/多角色工作台、图片手动替换、图文修改差异确认和对话测试界面。

当前远端模式可完成 Run、候选、真实草稿、图文修改和投稿主链路。对话测试的应用服务已具备，外部模型调用仍待单独授权。

不会伪造生产结果：Fixture 仅用于本地验收，远端缺少 Provider 时必须显示明确错误。

## 13. 开发顺序

1. 后端 OpenAPI、迁移、Run/Candidate/Task 状态机与 Worker。
2. 文本生成、文生图、媒体入库和单角色完整链路。
3. 多角色来源解析、候选池、并发生成和部分失败重试。
4. 工作台手改、Agent 修改预览、对话测试。
5. 投稿预检、部分提交、审计、灰度开关。
6. 管理后台一级入口、二级页面和端到端测试。

首批必须覆盖的测试：并发始终 ≤3、60 秒超时、仅自动重试一次、手动重试不封顶、租约接管、结构化输出拒绝、两种内容模式同时进入图文 Prompt、owner 隔离、revision 冲突、部分失败、提交幂等、刷新后任务不丢但不出现恢复入口。

## 14. 开发前唯一可调整项

当前设计按“任务开始前选择一个真实平台归属账号”推进。若产品实际要求角色归属官方/system，先改发布模型，不应拿普通用户账号伪装官方角色。

其余未定参数均已给出首期默认值，不阻塞开发。

## 15. 新任务用量与成本统计

### 15.1 需求与范围（2026-09-10）

- 单角色和多角色共用调用成本记录，金额以 USD 展示，token 为辅助指标。
- 纳入候选拆解、图片理解、角色文字/图片生成、Agent 改文/改图、工作台对话测试。
- 网页抓取、手动上传、图片裁剪、草稿保存和投稿不计模型成本；不计算基础设施费用。
- 批次总额包含所有已发生调用，包括被拒绝候选、失败调用、自动和手动重试。公共拆解与图片理解费用只计算一次；各角色显示自身直接调用成本，不将公共费用重复分摊。
- 初次生成、后续修改和对话测试按阶段分列，避免用后续调试费用冒充初次生成费用。
- 只对功能启用后创建的新 Run 开启统计。旧 Run 不回填；显示未记录，不能把缺失数据解释为零。
- 这是运营侧供应商成本核算，不产生用户扣费，不修改水晶、钱包、投稿及生成状态机。

### 15.2 计价依据

2026-09-10 核实的官方标准价格，单位为 USD / 1M tokens：

| 模型 | 普通文字输入 | 缓存文字输入 | 普通图片输入 | 缓存图片输入 | 图片输出 | 文字输出 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-image-2.5-flare` | 5 | 1.25 | 8 | 2 | 30 | 不计费 |
| `gpt-image-2.5-sunburst` | 5 | 1.25 | 8 | 2 | 30 | 不计费 |
| `gpt-4o-mini` | 0.15 | 0.075 | 按模型输入 token 计 | 按模型缓存输入 token 计 | 不适用 | 0.60 |

- 图片模型同价的已发布快照为 `*-2026-09-08`；不将该价格泛化到未知新模型或未来快照。
- 当前文字模型 `deepseek-v4-flash` 复用已有 `plum_model_prices` 有效版本。其它文字模型同样按实际 provider/model 解析已有价格，缺价保留用量并标待确认。
- 图片用量需要区分文字/图片输入与缓存；图片输出优先取 `output_tokens_details.image_tokens`，缺少该明细时依据图片模型的实际响应语义处理，不能将文字输出重复收费。
- 官方明确指出 GPT Image 2 的图片计算器不能估计 GPT Image 2.5 的 token 消耗。因此缺少实际 usage 或必要的模态/缓存拆分时，不按尺寸和质量捏造单张价格。
- 成本保存整数微美元和调用时价格快照，计算过程中不使用浮点金额。显示金额是按公开价格与实际 usage 计算的供应商成本，不承诺等于含折扣、税项和调账的最终账单。

官方来源：

- [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
- [GPT Image 2.5 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- [Images API usage 字段](https://developers.openai.com/api/reference/resources/images/methods/generate)

### 15.3 独立记录与失败隔离

在 `ai4all_bridge` 的 Plum 工厂模块内新增独立调用账本，不复用或写入用户聊天结算表。

```text
Run（新任务启用统计）
  -> FactoryTask / Preview Turn
      -> Provider Call（调用尝试及底层连接重试分别记录）
          -> 原始用量 + 归一化 token + 价格快照 + 微美元金额
```

- 记录 run/candidate/task 关联、cycle/attempt、底层 request_sequence、阶段、provider/model/request ID、调用状态、用量、价格版本/快照与时间。不保存 Prompt、图片内容或对话正文。
- 调用记录按唯一调用身份幂等保存；手动重试会更新 Task，但不能覆盖之前的成本记录。
- 在获得供应商响应时采集用量，先于 JSON Schema 校验和图片入库。后续业务失败仍保留已有用量和金额。
- 调用开始、完成和未知结果分别记录。已发送请求但超时、缺少 usage、缺少价格、异常退出或记账遗漏均不解释为免费。
- 记录在任务执行入口创建；若参数或 Provider 校验在发送请求前失败，该尝试没有供应商用量，保守显示待确认。调用次数因此是尝试记录数，不能作为供应商已收费请求数。
- 账本写入与成本查询不参与主业务事务，不影响重试判定、租约、草稿和投稿。成本记录异常需日志可追踪，并在汇总中表现为不完整，不能静默显示完整的零元成本。
- 不新增模型调用，不改变 Prompt、模型选择、生成参数和外部并发上限。共享组件只增加兼容的用量采集能力；不改变已有返回契约和用户结算行为。

### 15.4 API 与界面

新增独立 `GET /admin/plum/character-factory/runs/{run_id}/costs`，沿用工厂权限、可用性检查和标准响应包装；前端使用同源显式 BFF 路径。

响应包含 `tracking_enabled`、`tracking_incomplete`、`missing_calls`、`currency`、`totals`、`shared`、`candidates`、`phases` 与 `calls`。`missing_calls` 根据累计领取的任务尝试与账本中不同任务尝试比较，避免底层连接重试掩盖遗漏记录。汇总项包含：

- `cost_usd_micros`：只有统计完整且全部可计价时才返回总额，否则 `null`。
- `known_cost_usd_micros`：已确认可计价部分的合计，不能当成整批完整成本。
- `input_tokens / output_tokens`：实际用量合计；对应记录缺失则为 `null`。
- `total_calls / unpriced_calls / pending_calls`：调用数量和完整性信号。

调用明细保留阶段、候选、模型、cycle/attempt、执行结果、计价状态和金额。任务执行失败与是否产生模型费用是两个独立状态。

前端新增独立成本查询组件用于单角色、多角色及候选工作台；成本接口暂不可用时只影响该区域，不阻断业务轮询和按钮。单角色/批次显示总额、输入/输出 token、分阶段费用；批次另外列出公共费用与各角色直接成本。支持展开逐次调用明细，明确显示待确认和进行中的调用。

### 15.5 验收与实现检查

1. 新 Run 开启记录，旧 Run 不回填、不显示假零元。
2. 普通、缓存、推理及图片/文字 token 不重复计价，价格改变不重算旧记录。
3. 批量公共费用只计一次，候选删除和手动重试不丢失已发生费用。
4. Schema 校验失败、图片保存失败仍保留供应商已经返回的 usage；超时及缺失字段呈现待确认。
5. 记录幂等、账号/Run 隔离、API 权限和异常隔离通过聚焦 PostgreSQL 测试。
6. 文字/视觉/图片/对话调用的用量采集均通过测试；用户钱包和生成结果不受影响。
7. 桌面和移动端总额、部分金额、明细及接口故障状态可读且不挤压主操作。

### 15.6 实现落点与发布顺序

| 仓库 / 文件 | 职责 |
| --- | --- |
| `ai4all_bridge/app/db/migrations/plum.py`，迁移 159 | 新增独立账本、Run 统计开关及完整性标记、Task 累计预期次数；旧 Run 默认关闭 |
| `ai4all_bridge/app/agent_runtime/llm/observation.py` | 请求上下文内可选响应与重试观察器，异常隔离 |
| `ai4all_bridge/app/products/plum/application/character_factory_cost.py` | 用量检查、缓存拆分、价格计算和完整/部分金额汇总 |
| `ai4all_bridge/app/products/plum/infrastructure/character_factory_cost.py` | 独立账本事务、不可变价格快照、重试归属、任务结果同步与查询 |
| `ai4all_bridge/app/products/plum/api/admin/character_factory.py` | 独立成本读取接口，沿用角色工厂权限 |
| `plum_admin/features/character-factory/cost-panel.tsx` | 单角色、批量、候选工作台共用成本面板，独立刷新及异常状态 |
| `plum_admin/features/character-factory/costs.ts` | 从 OpenAPI 生成类型、运行时响应校验及金额格式化 |
| `plum_admin/lib/bff/allowlist.ts` | 成本接口仅允许 GET |

后端复用既有有效价格查询与 `compute_costs` 的实际供应商成本；不使用运营加价或水晶换算。DeepSeek 缓存命中字段在工厂计价模块中兼容。图片模型使用本节注明的价格快照，未知模型或异常用量保持待确认。

发布时先部署后端并通过现有启动流程执行迁移 159，再部署前端。无需历史数据脚本；只有新版创建的新 Run 记录费用。前端先上线或成本接口暂不可用时，成本面板显示读取失败，生成流程仍可用。本次开发验收不执行生产迁移、不重启生产服务。

验证采用临时 PostgreSQL 数据库和模拟供应商响应，覆盖计价/缓存异常、失败费用保留、连接重试、任务结果同步、旧任务、遗漏记录、权限及账本异常隔离；前端覆盖 API/BFF 权限、类型检查，以及桌面和手机的完整/部分成本、批量公共费用、候选归属、接口故障与异常响应。验收未调用付费模型；真实供应商最终账单仍需上线后按请求记录核对。

2026-09-10 本地验证：后端 189 项聚焦测试通过（含共享 LLM adapter）；前端 API/BFF 23 项、桌面/手机成本面板 E2E 12 项通过。前端 TypeScript、接口生成一致性和修改文件 ESLint 通过，后端修改模块 Ruff 及两仓库 diff 格式检查通过。`app/db/_core.py` 既有兼容导出的 F401 不属于本次改动，未做无关清理。
