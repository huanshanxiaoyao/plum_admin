# Plum 管理后台验收样例

- 文档版本：v0.3
- 文档状态：Ready for Implementation
- 更新时间：2026-08-30
- 关联 PRD：[Plum 管理后台产品需求文档](./PRD.md)
- 关联技术设计：[Plum 管理后台技术设计](./TECHNICAL_DESIGN.md)

## 1. 用途

本文定义一组不含真实个人信息的确定性验收数据和场景，作为以下工作的共同输入：

- 后端 PostgreSQL 测试 Fixture。
- `plum_admin` 前端 Mock 数据。
- API Contract Test。
- 后端隔离测试数据库 Seed。
- 产品、运营、审核和管理员 UAT。

所有邮箱使用 RFC 保留域 `.invalid`，手机号为不可路由测试值。生产环境不得导入本文测试身份。本文保留长期验收样例；标记为“后续”的章节和场景不属于一期退出门槛，也不要求一期 Seed Helper 创建对应数据。

## 2. 固定时间与口径

- 验收基准时间：`2026-08-28T04:00:00.000Z`。
- 日报默认时区：`Asia/Shanghai`。
- 时间区间：`[from, to)`。
- 订阅方案枚举：`free`、`standard`、`premium`，与当前用户前端展示一致。
- `billing_connected=false`：方案记录不代表真实支付成功。
- 钱包展示单位：Coin；该口径保留供后续使用，一期不返回 Wallet/Ledger。

## 3. 后台成员样例

以下 `open_id` 均为合成值，只用于临时 PostgreSQL 和测试；生产成员必须使用飞书实际返回、且属于当前应用的 `open_id`。

| Feishu Open ID | Email | Role | Status | 用途 |
| --- | --- | --- | --- | --- |
| `ou_accept_operator` | 空 | `operator` | `active` | 日常查询、官方角色和内容治理 |
| `ou_accept_operator_2` | 空 | `operator` | `active` | 并发和第二 Operator 验证 |
| `ou_accept_admin` | 空 | `admin` | `active` | 恢复角色、Membership 和成员管理 |
| `ou_accept_disabled` | 空 | `operator` | `disabled` | 禁用成员验证 |

预期：

- 三个 Active 成员的 `/admin/plum/me` 返回各自 Capability。
- `X-Admin-User-Id` 只传上述 `open_id`、`X-Admin-Email` 为空时仍可解析成员。
- Disabled 成员登录成功后，业务 API 返回 `403 admin_user_disabled`。
- 不在表中的飞书用户返回 403，拒绝页显示本人 `open_id`，且不会被自动写成 Operator 或 Admin。

## 4. 平台用户样例

| Platform User ID | Display Name | Plum Membership | Subscription | Wallet | 说明 |
| --- | --- | --- | --- | --- | --- |
| `pusr_accept_official` | Plum Official | active | free/active | 0 Coin | 固定官方创作者账号 |
| `pusr_accept_creator_active` | Mira Studio | active | standard/active | 120 Coin | 正常 UGC 创作者 |
| `pusr_accept_creator_restricted` | North Window | active | premium/active | 35 Coin | 被暂停创作但仍可聊天 |
| `pusr_accept_member_free` | Rowan | active | free/active | 8 Coin | 普通 Plum 用户 |
| `pusr_accept_member_disabled` | Jules | disabled | free/active | 20 Coin | Plum Membership 被禁用 |
| `pusr_accept_subscription_cancelled` | Sage | active | premium/cancelled | 5 Coin | 历史非 Active 方案 |
| `pusr_accept_zhaoxi_only` | Other Product User | none | zhaoxi/free | 50 Coin | 跨产品隔离反例 |

测试登录标识：

| Platform User ID | 原始值，仅 Fixture 内使用 | 普通后台预期 |
| --- | --- | --- |
| `pusr_accept_creator_active` | `creator-active@users.invalid` | `c***@users.invalid` |
| `pusr_accept_member_free` | `member-free@users.invalid` | `m***@users.invalid` |

预期：

- 普通用户目录返回前六个具有 Plum Membership 的用户。
- `pusr_accept_zhaoxi_only` 不出现在任何 Plum 用户、订阅或钱包列表中。
- Operator 和 Admin 的普通用户详情都只返回脱敏登录标识。
- 一期不存在绕过脱敏的普通页面或 Capability。

## 5. 创作者样例

| Platform User ID | Public Profile | Control Status | Internal Note | 作品摘要 |
| --- | --- | --- | --- | --- |
| `pusr_accept_official` | `profile_accept_official` / Plum Official | active | Official catalog owner | 1 Active Character、1 Draft |
| `pusr_accept_creator_active` | `profile_accept_creator_active` / Mira Studio | active | Reliable creator | 2 Active、1 Takedown |
| `pusr_accept_creator_restricted` | `profile_accept_creator_restricted` / North Window | restricted | Repeated policy review | 1 Rejected Draft |

控制记录：

```json
{
  "platform_user_id": "pusr_accept_creator_restricted",
  "status": "restricted",
  "reason": "repeated_policy_review",
  "internal_note": "Repeated policy review",
  "updated_by_admin_user_id": "ou_accept_operator",
  "restricted_at": "2026-08-27T08:00:00.000Z",
  "updated_at": "2026-08-27T08:00:00.000Z"
}
```

预期：

- Restricted 创作者可以浏览角色和继续已有聊天。
- Restricted 创作者上传创作媒体、创建草稿或提交发布时返回稳定的 403 业务错误 `creator_restricted`。
- Operator 可以恢复创作资格；该权限与 Character Restore 无关。
- 修改内部备注后，当前表只保留最新备注，审计事件保留修改前后摘要。

## 6. Character 样例

| Character ID | Work ID | Owner | Name | Status | Rating | Visibility | Content Version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `char_accept_official_active` | `work_accept_official_active` | Official | Ada | active | general | public | 2 |
| `char_accept_ugc_general` | `work_accept_ugc_general` | Mira Studio | Sol | active | general | public | 1 |
| `char_accept_ugc_mature` | `work_accept_ugc_mature` | Mira Studio | Vale | active | mature | public | 3 |
| `char_accept_ugc_takedown` | `work_accept_ugc_takedown` | Mira Studio | Ember | takedown | general | public | 1 |
| `char_accept_private` | `work_accept_private` | Mira Studio | Ione | active | general | private | 1 |

Character 详情样例：

```json
{
  "id": "char_accept_official_active",
  "work_id": "work_accept_official_active",
  "display_name": "Ada",
  "source": "official",
  "status": "active",
  "content_rating": "general",
  "visibility": "public",
  "content_version": 2,
  "published_at": "2026-08-20T02:00:00.000Z",
  "creator": {
    "platform_user_id": "pusr_accept_official",
    "profile_id": "profile_accept_official",
    "display_name": "Plum Official"
  },
  "stats": {
    "interaction_count": 1800,
    "like_count": 240,
    "favorite_count": 88
  }
}
```

预期：

- 默认 Character 列表只展示可管理 Character，不混入尚未生成 Character 的 Draft。
- `status=active&visibility=public` 返回前三个 Public Active Character。
- Mature 筛选只返回 `char_accept_ugc_mature`。
- 下架后的 `char_accept_ugc_takedown` 不出现在公开 Feed，不能创建新会话。
- Private Character 不进入公开 Feed，但 Operator 和 Admin 的 Character 目录可以查看其摘要。

## 7. Work 和草稿样例

| Work/Draft ID | Owner | Name | State | Moderation | Published Character |
| --- | --- | --- | --- | --- | --- |
| `work_accept_official_active` | Plum Official | Ada | published | approved | `char_accept_official_active` |
| `work_accept_official_draft` | Plum Official | Nia | draft | not_submitted | none |
| `work_accept_creator_rejected` | North Window | Ash | draft | rejected | none |
| `work_accept_creator_pending` | Mira Studio | Lumen | draft | pending_review | none |

预期：

- `/admin/plum/works` 可以按 Owner、State 和 Moderation 筛选。
- Rejected 和 Pending Review 项不会出现在 `/admin/plum/characters`。
- Operator 只能通过官方 Work 写接口修改 `work_accept_official_draft`，不能编辑 UGC Work。
- 客户端提交 `owner_platform_user_id` 时返回 `422 validation_failed`，不能覆盖固定官方 Owner。

## 8. 订阅和钱包样例

### 8.1 Subscription

**交付阶段：一期。**

```json
{
  "id": "sub_accept_standard_active",
  "platform_user_id": "pusr_accept_creator_active",
  "app_id": "plum",
  "plan": "standard",
  "status": "active",
  "billing_connected": false,
  "created_at": "2026-08-01T01:00:00.000Z",
  "updated_at": "2026-08-20T01:00:00.000Z"
}
```

预期：

- 页面显示 Standard / Active，同时明确显示“未连接支付，方案记录不代表付款”。
- 一期没有修改 Plan、取消订阅、退款或续费按钮。
- `pusr_accept_subscription_cancelled` 显示 Premium / Cancelled，不显示为 Active Subscriber。

### 8.2 Wallet Ledger

**交付阶段：后续，不作为一期验收或 Fixture 要求。**

`pusr_accept_creator_active`：

| Ledger ID | Type | Amount | Balance After | Created At |
| --- | --- | --- | --- | --- |
| `ledger_accept_grant` | grant | +150 Coin | 150 Coin | `2026-08-01T01:00:00.000Z` |
| `ledger_accept_turn_01` | turn_charge | -10 Coin | 140 Coin | `2026-08-22T03:00:00.000Z` |
| `ledger_accept_turn_02` | turn_charge | -20 Coin | 120 Coin | `2026-08-27T05:00:00.000Z` |

预期：

- 当前余额为 120 Coin。
- 流水按 `created_at DESC, id DESC` 排序。
- 所有角色的页面都没有人工增加、扣减或重置余额入口。

## 9. Moderation 样例

**交付阶段：后续，不作为一期验收或 Fixture 要求。** 一期官方角色仍需通过现有审核链路，但不建设任务领取和人工决策页面。

| Task ID | Resource | Assigned Operator | Status |
| --- | --- | --- | --- |
| `mod_accept_assigned` | `work_accept_creator_pending` | `ou_accept_operator_2` | claimed |
| `mod_accept_unassigned` | unrelated fixture work | none | pending |

预期：

- `ou_accept_operator_2` 可以读取和决策 `mod_accept_assigned`。
- `ou_accept_operator` 可以领取并决策 `mod_accept_unassigned`。
- 已被其他人领取的任务不能被静默覆盖；冲突时返回 409。

## 10. RBAC 验收场景

| 编号 | 阶段 | 身份 | 操作 | 预期 |
| --- | --- | --- | --- | --- |
| RBAC-01 | 一期 | Operator | GET Character/User/Subscription | 200，敏感字段脱敏 |
| RBAC-02 | 一期 | Operator | Create and Publish Approved Official Work | 201/200，Owner 固定为 Official |
| RBAC-03 | 一期 | Operator | Takedown Active UGC Character | 200，写入审计 |
| RBAC-04 | 一期 | Operator | Restrict or Restore Creator | 200，写入审计 |
| RBAC-05 | 后续 | Operator | Claim and Review Moderation Task | 200，遵循审核状态机 |
| RBAC-06 | 一期 | Operator | Restore Takedown Character | 403 `admin_permission_denied` |
| RBAC-07 | 一期 | Operator | Disable Plum Membership | 403 `admin_permission_denied` |
| RBAC-08 | 一期 | Operator | Add or Disable Admin Member | 403 `admin_permission_denied` |
| RBAC-09 | 一期 | Admin | Restore Character, Manage Membership and Staff | 200，二次确认并写审计 |
| RBAC-10 | 一期 | Disabled member | Any Business API | 403 `admin_user_disabled` |

高级操作升级采用人工协作而非后台审批单：Operator 被拒绝后联系 Admin；Admin 使用自己的会话执行。审计事件的操作者必须是 `ou_accept_admin`，不能记录为提出请求的 Operator。

## 11. API 契约验收场景

### API-01 错误格式

Operator 恢复已下架 Character：

```json
{
  "error": {
    "code": "admin_permission_denied",
    "message": "You do not have permission to perform this action.",
    "request_id": "c255a9ba-779a-4c6c-9f99-dfc9de6385b6",
    "details": {}
  }
}
```

预期 HTTP 403，Body 不出现 FastAPI `detail`、堆栈或 Capability 内部实现。

### API-02 分页

请求：

```text
GET /admin/plum/characters?limit=2&sort=published_at.desc
```

第一页预期返回两个 Character、`has_more=true` 和非空 `next_cursor`。第二页使用原筛选和 Cursor，不重复第一页 ID。将 Cursor 改用于 `rating=mature` 时返回 `400 invalid_cursor`。

### API-03 时间

请求：

```text
GET /admin/plum/audit-events?from=2026-08-27T00:00:00%2B08:00&to=2026-08-28T00:00:00%2B08:00
```

预期后端按 UTC 区间 `[2026-08-26T16:00:00.000Z, 2026-08-27T16:00:00.000Z)` 查询，响应中的所有时间使用 `Z`。

### API-04 幂等发布

使用同一个 `Idempotency-Key: accept-official-publish-001` 连续提交两次 `work_accept_official_draft` 的同一 Revision。两次返回相同 Character ID，只生成一个 Character Version 和一个有效发布结果。

### API-05 并发冲突

两个 Operator 同时编辑官方草稿 Revision 3。第一个保存成功生成 Revision 4；第二个返回 `409 revision_conflict`，不得覆盖 Revision 4。

## 12. 治理验收场景

### GOV-01 下架与恢复

1. Operator 下架 `char_accept_ugc_general`，原因 `policy_review`。
2. Character 退出公开 Feed，并禁止新会话。
3. Operator 尝试恢复，返回 403。
4. Admin 恢复；后端重新检查审核、媒体、Visibility 和 Work Lifecycle。
5. 审计页出现 Takedown 和 Restore 两条独立事件。

### GOV-02 创作者限制

1. Operator 将 `pusr_accept_creator_active` 设为 Restricted。
2. 该用户继续已有聊天成功。
3. 上传创作媒体、创建草稿和提交发布均返回 `creator_restricted`。
4. 既有 Active Character 不自动下架。
5. Operator 恢复创作资格，创建草稿重新成功。

### GOV-03 Membership 隔离

1. Admin 禁用 `pusr_accept_member_free` 的 Plum Membership。
2. Plum 登录和业务请求被阻断。
3. 如果该用户同时具有其他产品 Membership，其他产品状态保持不变。
4. 恢复后 Plum 资格重新生效。

## 13. 非功能验收

- 后台 Next.js 停止时，`https://plum.top` 仍可访问和聊天。
- 角色、创作者、用户列表各执行一页查询时不存在按行追加的 N+1 SQL。
- 普通后台响应和日志中不出现完整登录标识、Cookie、Bearer Token、Prompt 或聊天正文。
- 高风险业务写入与 `admin_access_events` 位于同一事务；审计写入失败时业务写入回滚。
- 角色分页在第一页读取后插入一个排序更靠前的新角色，继续翻页不重复或跳过原快照位置之后的既有记录。
- `limit=0`、`limit=201`、损坏 Cursor 和无 Offset 时间分别返回稳定的 400 错误码。

## 14. Fixture 实施要求

后续实现时，将本文拆成以下可执行资产：

```text
weixin_bot/tests/products/plum/fixtures/admin_acceptance.py
weixin_bot/tests/products/plum/test_admin_management_api.py
plum_admin/tests/fixtures/admin-acceptance.ts
plum_admin/tests/e2e/admin-acceptance.spec.ts
```

要求：

- 后端 Fixture 通过 Repository 或明确的测试 Seed Helper 创建，不从测试调用生产 Admin HTTP 写接口准备前置数据。
- 前端 Mock 与后端 Contract 使用相同字段名和枚举。
- 所有 ID 固定，不使用随机值，便于失败定位和截图对比。
- 每个测试独立数据库或事务回滚，不依赖执行顺序。
- Production 配置检测到 `accept_` Fixture ID 时拒绝导入。
