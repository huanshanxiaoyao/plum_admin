# 角色批量导入 · 后端需求

- 文档版本：v1.0
- 更新时间：2026-09-05
- 目标仓库：`ai4all_bridge`
- 关联文档：[产品需求](./CHARACTER_IMPORT_PRD.md) · [技术设计](./CHARACTER_IMPORT_TECHNICAL_DESIGN.md)
- 前端进度：解包 / CSV 解析 / 本地校验 / 模块注册 / 路由骨架已完成并有单测，等后端接口联调

## 0. 一句话

后台需要一个批量导入角色的入口。**不新增发布内核**——草稿、媒体直传、图片渲染、同步机审、人工复核入队、改版发布、幂等去重全都已经存在。后端要做的是一层**编排 API**，把已有用例串起来，并允许由服务端指定内容归属账号。

## 1. 边界

### 1.1 做

- Admin 侧的媒体上传三件套（owner 由服务端注入，不再从用户会话取）
- 归属账号解析与校验
- 逐行预检（只读，无副作用）
- 逐行导入执行 + 批次记录表
- 字段 schema 端点
- 契约导出与审计

### 1.2 不做（明确排除，避免跑偏）

- **不改任何领域模型。** `publish_created_character` 里写死的 `owner_kind='platform_user'`（`app/products/plum/infrastructure/repository/characters.py:571`）保持不动，导入产物一律是 `source=ugc`。本期不引入官方账号。
- 不新增 capability。全部复用 `operations.access`。
- 不做批次回滚、不做定时调度、不做开放 API。
- 不做角色正文导出。结果清单只含标识与状态。
- 不新增异步任务基础设施。压缩包在浏览器里解，图片走已有的 S3 直传，没有大请求经过服务端。

### 1.3 命名冲突提醒

`app/products/plum/api/imports.py` 已经存在，是 creator 侧 `/creator/imports/text` 的 501 占位，与本需求**无关**。本次新增的是 Admin 侧路由，建议放 `app/products/plum/api/admin/imports.py`，不要往那个文件里加。

## 2. 硬前置（不是后端做，但卡住联调）

**S3 Bucket CORS 必须放行后台域名。** 当前生产配置（`docs/ops/products/plum/production-release-checklist.md:69`）的 `AllowedOrigins` 只有 `https://plum.top` 和 `https://www.plum.top`，浏览器从 `admin.plum.top` 直传会被拦死。

这条不通，「浏览器解包 + 图片直传」的架构就不成立，方案要改成服务端中转加异步任务，工作量翻几倍。**请在后端开工前确认这条已经安排。**

## 3. 任务清单

### B1 · 归属账号解析与校验

导入的每个角色都必须归属到一个真实的平台用户账号。批次级默认账号由前端提交，行级可覆盖。

实现一个内部解析器，供 B3 与 B4 共用：

| 校验 | 数据源 | 失败错误码 |
| --- | --- | --- |
| 账号存在 | `platform_users` | `owner_not_found` |
| 持有 Plum Membership 且 active | `product_memberships` where `app_id='plum'` | `owner_membership_inactive` |
| 创作资格未受限 | `plum_creator_controls` | `creator_restricted` |

要点：

- 批次默认账号**必填**，请求体里缺失或为空即整批 400（`owner_required`），不允许落到任何隐式默认值上。行级缺省时取批次默认值，因此下游拿到的 owner 永远不是 `None`。
- `plum_creator_controls` 目前尚未落地。该项按「表不存在则跳过」实现，表落地后自动生效，不需要回头改导入代码。
- 导入路径**不经过** `require_released_plum_member`。目标账号是否完成 18+ 声明不影响导入——归属账号是内容归属，不是操作者身份。
- Public Profile 不需要预先准备，`publish_created_character` 缺失时会自动建（`repository/characters.py:541`）。

**不需要新增账号查询端点。** 前端的账号选择器直接复用已有的 `GET /admin/plum/users?q=`（`app/products/plum/api/admin/users.py:85`），它已经支持模糊搜索且只要 `operations.access`。

### B2 · Admin 侧媒体端点

现有 creator 媒体端点从会话取 owner：

- `app/products/plum/api/media.py:187` `POST /creator/media/uploads`
- `app/products/plum/api/media.py:243` `POST /creator/media/uploads/{media_id}/complete`
- `app/products/plum/api/media.py:312` `POST /creator/media/image-sets`

三者都是 `principal: SessionPrincipal = Depends(require_released_plum_member)`，然后用 `principal.platform_user_id` 作为 owner。

新增三个同语义的 Admin 端点，**owner 从请求体里的批次归属账号注入**，其余逻辑（签名、字节数与 sha256 校验、Pillow 重解码、裁剪渲染）直接调用同一批函数：

| 新端点 | 对应 |
| --- | --- |
| `POST /imports/media/uploads` | `create_presigned_upload` + `insert_media_asset` |
| `POST /imports/media/uploads/{media_id}/complete` | 同 `complete_creator_portrait_upload` 的校验链 |
| `POST /imports/media/image-sets` | `create_character_image_set` |

要点：

- **不要复制校验实现。** 复制一份意味着以后 creator 侧收紧了规则而导入侧没跟上，这正是"绕过审核的旁路"的典型来路。
- 依赖用 `require_operations_write_access`（`api/admin/deps.py:97`），它同时管能力与写开关。
- 限流键按**操作员**算，不按归属账号算——一次导入 100 个角色会集中打同一个 owner，按 owner 限流会误伤自己。
- 媒体隔离模型完全不动，仍然挂在 `owner_platform_user_id` 下。

### B3 · 预检（只读）

`POST /imports/characters/preflight`

请求体：`batch_id`、`default_owner_platform_user_id`、`rows[]`（manifest 的逐行内容 + 每张图的文件名/字节数/宽高/sha256）。

逐行返回：

| 字段 | 说明 |
| --- | --- |
| `operation` | `create` / `update`，由 `character_id` 是否有值决定 |
| `expected_revision` | 更新行的草稿当前 revision，提交时回传做乐观锁 |
| `changed_fields` | **只含字段名，不含内容** |
| `portrait_action` | `upload` / `reuse` |
| `prompt_budget` | 各文本块的 token 占用与上限 |
| `issues[]` | 逐条错误码 + 中文说明 |

要点：

- **必须零副作用。** 运营会反复上传修改后的包直到全绿，预检写任何东西都会留下垃圾。
- token 预算调 `application/character_prompt_budget.py::assert_character_prompt_fits`，与发布期用同一个入口。不能另写一套估算——否则会出现"预检说没超、提交却被拒"。
- `changed_fields` 只回字段名是刻意的：导入是写入口，不能顺带变成正文明文读出口。这条边界在代码评审时要守住。
- 更新行的定位链路：`character_id` → `plum_characters.work_id` → `plum_creation_drafts(work_id)` → 校验 `published_character_id == character_id` → 校验 owner 一致 → 取当前 `revision`。
- **已知限制，不要绕过**：历史 seed 进去的角色没有创作草稿行，更新时返回 `character_not_editable`。不要为它临时造一条草稿——那会绕开草稿本该承载的编辑历史。

### B4 · 导入执行与批次记录

`POST /imports/characters`

请求体在 preflight 的基础上增加：`reason`（必填）、`confirmations`（`adult_confirmed` / `rights_confirmed`）、每行的 `portrait_media_id` / `image_set_id` / `expected_revision`。

执行链路（逐行，复用现有用例）：

1. 写入/更新 `plum_creation_drafts` 的对应草稿行
2. 调 `application/character_creation.py::submit_creation_draft`，与 creator 侧 `api/creation.py:166` 的 `publish_work_draft` 走同一条路
3. `submit_creation_draft` 内部按 `published_character_id` 分流到新建或改版

要点：

- **服务端对每一行重新执行完整校验，不信任预检结论。** 预检只是 UX 前置。
- **逐行独立，不做整批事务。** 机审是外部调用，整批回滚既做不到也不合理。一行失败不影响其他行。
- 幂等键 `sha256(batch_id + "|" + row_key)[:64]`，落到已有的 `creation_publish_requests` / `plum_character_version_publish_requests`。`batch_id` 由包内容哈希派生，重复上传同一个包会命中重放而不是二次创建。
- `revision_conflict` 判定该行失败，**永不自动重试**——自动重试等于用旧内容覆盖别人刚做的修改。
- 批次串行：全平台同时只允许一个导入在跑，用一把锁挡住。
- 更新触发人工复核时保持 `promote_projection=False`，上一个已批准版本继续在线。这是现有语义，只要不写错参数即可。

新增两张表：

- `plum_character_import_batches`：`batch_id`、操作员 open_id、归属账号、`reason`、两个确认项、行数、四类计数、时间
- `plum_character_import_rows`：`batch_id`、`row_key`、`operation`、`status`、`character_id`、`work_id`、`review_id`、`version_number`、`error_code`、`error_message`

`status` 四态：`published` / `pending_review` / `rejected` / `failed`。**`pending_review` 是正常终态，不计入失败。**

行记录表是结果清单导出的唯一数据源。它**不 JOIN 内容表**，因此结构上不可能泄出正文——评审时出现对内容表的联表查询应视为设计违背。

配套两个只读端点：`GET /imports`（批次分页列表）、`GET /imports/{batch_id}`（逐行结果）。

### B5 · schema、契约与审计

`GET /imports/characters/schema`：字段定义、枚举、字符与 token 上限、当前 active 的 tag 词表（`data/plum/tags.json`）。前端的规范说明页读它，不再手工同步。

**契约导出**：新端点加进去之后跑

```bash
.venv/bin/python scripts/export_openapi.py --product plum-admin
```

产出的 `docs/products/plum/openapi/admin_v1.json` 需要同步到 `plum_admin` 仓库的 `contracts/plum-admin-v1.openapi.json`（前端有 `npm run contract:check` 门禁，字节不一致就红）。

**审计**：

| 事件 | 内容 |
| --- | --- |
| `plum.character.import` | `batch_id`、归属账号、行数、四类计数、`reason`、两个确认项、操作员 open_id |
| `plum.character.create` / `plum.character.revise` | `row_key`、`character_id`、`work_id`、`operation`、机审结论、`changed_fields`（**仅字段名**） |

审计禁止项：角色正文、立绘字节、Token、Cookie、完整 Prompt。审计写入失败则该行失败——不允许"改了但没记录"。

权限复用 `operations.access` 之后，"谁能导入"这道闸门是宽的，审计完备性是主要的补偿手段。

## 4. 依赖顺序

```
B1 ──┬── B3 ──┬── B4 ── B5
     │        │
B2 ──┘        └── 前端 F4（契约同步、切远端数据源）
```

B1 与 B2 可并行。前端 F1–F3 不依赖后端，已在进行。

## 5. 测试要求

沿用现有约定：`pytest-postgresql` 每测试克隆完整迁移模板。

- 新建与更新两条路径各自的 happy path
- `character_id` 不存在、无草稿、归属不匹配三种拒绝，且**无任何写入**
- `revision_conflict`：预检后改动角色再导入
- 幂等：同一 `batch_id` + `row_key` 重复提交只创建一次
- 归属账号校验矩阵：不存在、Membership 非 active
- **回归：导入产物的 `source` 恒为 `ugc`、`owner_kind` 恒为 `platform_user`**（防止后续改动无意引入 official）
- 机审 approved / needs_review / rejected 三种结论的逐行终态
- 更新触发 needs_review 时旧版本仍是当前投影（`promote_projection=False`）
- 批次串行锁
- 预检零副作用：跑完 preflight 后数据库无变化
- 跨产品隔离：导入固定 `app_id=plum`

## 6. 上线前

先用一个 3 角色的小包在生产跑一遍完整链路（含 1 个更新行），确认审计、复核队列与角色详情都正确，再开放给运营。
