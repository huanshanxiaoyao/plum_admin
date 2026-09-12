# 生图工作流 · 技术设计

## 一条主链

```text
描述 / 参考图
  -> OpenAI 视觉理解 + Prompt 生成
  -> 人工编辑并确认 Prompt
  -> Midjourney 异步生成 4 张候选图
  -> 选择 1 张作为 v0
  -> OpenAI 图片编辑生成 v1...vn
  -> 人工设为最终图
```

`Limited / Limitless` 写入每次模型请求。`Limited` 禁止成人向表达；`Limitless` 允许合规成人向表达，但仍禁止未成年人、非自愿与违法内容。

## 模块边界

- `plum_admin`：输入、上传、轮询、Prompt 确认、候选选择、版本切换和定稿。
- `ai4all_bridge`：鉴权、状态机、任务执行、模型调用、媒体归档和审计。
- OpenAI：理解参考图、生成 Midjourney Prompt、基于当前图片修图。
- Midjourney 网关：只负责首轮候选图。使用 `MID_JOURNEY_KEY`，默认模型 `midjourney-8.2-fast`。

密钥只放后端。管理后台通过现有 `/api/admin/*` BFF 转发，不接触模型密钥。

## 数据

一个 `image_run` 保存原始输入、内容模式、当前状态和最终版本。其下包含：

- `prompt_versions`：OpenAI 分析结果、Prompt 内容、是否已确认。
- `candidates`：Midjourney task id、序号、已归档 media id、是否选中。
- `versions`：父版本、人工指令、OpenAI 结果 media id；Midjourney 选中图是 `v0`。
- `tasks`：`prompt_generate / image_generate / image_edit`，记录 provider、model、attempt、错误。

所有查询按 `operator_open_id` 隔离。参考图和生成结果进入现有媒体存储；数据库不长期依赖第三方 URL。

已确认的数据边界：运营上传的参考图可发送给 OpenAI 做图片理解；草稿当前图片可发送给 OpenAI 做图片修改。Responses 请求使用 `store: false`；后端日志不记录图片字节、Prompt 原文或供应商响应正文，生成结果只归档到自有媒体存储。

## API

```text
POST /admin/character-factory/image-runs
GET  /admin/character-factory/image-runs/{run_id}
POST /admin/character-factory/image-runs/{run_id}/prompt
POST /admin/character-factory/image-runs/{run_id}/prompt/confirm
POST /admin/character-factory/image-runs/{run_id}/generate
POST /admin/character-factory/image-runs/{run_id}/candidates/{candidate_id}/select
POST /admin/character-factory/image-runs/{run_id}/edits
POST /admin/character-factory/image-runs/{run_id}/versions/{version_id}/finalize
GET  /admin/character-factory/image-runs/{run_id}/media/{media_id}
POST /admin/character-factory/image-runs/{run_id}/tasks/{task_id}/retry
```

创建、Prompt 操作、生成、选择、修图和手动重试要求 `Idempotency-Key`；定稿由 `version_id + expected_revision` 保证自然幂等。写操作沿用 `operations.access` 与 Admin 写开关，并同时受角色工厂总开关和生图工作流子开关控制。

## 状态与失败

```text
input -> prompting -> prompt_ready -> generating -> candidates_ready
      -> editing -> finalized
```

单节点失败进入 `failed`，保留最后一个可用状态和产物。模型任务默认超时 60 秒、自动重试 1 次；Midjourney 提交成功后通过 task id 轮询，超时不重复提交。手动重试创建新 cycle，不限制次数。

同一 Run 同时只允许一个活跃任务。供应商已接受请求但结果无法可靠落库时，不自动重发付费请求；生成媒体先保持可回收的 `pending`，只在任务结果同一事务提交时转为永久引用。Midjourney 返回图仅允许从配置的供应商域名下载。

创建成功后，前端把 `run_id` 写入 URL。刷新页面通过 `GET image-runs/{run_id}` 恢复当前 Prompt、候选图、版本链与异步任务；瞬时轮询失败按退避策略继续同步。

## 首期边界

- 一次只生成一组 4 张候选图，画幅先支持 `1:1 / 3:4 / 4:3 / 9:16 / 16:9`。
- Prompt 可人工编辑；确认后不可原地覆盖，只能产生新版本。
- 修图是线性版本链；支持选历史版本继续生成，不做分屏像素级编辑。
- 定稿仅标记最终版本并保留素材，暂不自动写入角色草稿。
