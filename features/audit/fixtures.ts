import type { AuditEvent, AuditListQuery } from "./audit-contracts.ts";

/**
 * 审计页的 fixture。刻意把**导入**与**复核三处置**混在一起，因为这一页存在的理由就是
 * 「共用写开关放开之后，两类写操作都留得下账」——只有导入的样例证明不了这件事。
 * 其中 `plum_moderation.purge` 不可撤销、`view_review` 是明文读取，这两条最该一眼看见。
 */
const EVENTS: readonly AuditEvent[] = [
  {
    id: "10242",
    occurred_at: "2026-09-05T03:10:00.000Z",
    actor_open_id: "ou_71ef6b6652b488fb",
    actor_display_name: "林运营",
    action: "plum.wallet.manual_grant",
    resource_type: "entitlement_ledger",
    resource_id: "tx_manual_001",
    plaintext: false,
    reason: "第二轮测试额度",
    request_path: "/admin/plum/users/pusr_accept_member_free/wallet/grants",
    metadata: {
      platform_user_id: "pusr_accept_member_free",
      amount: 500,
      balance_before: 405,
      balance_after: 905,
      validity_days: 30,
      expires_at: "2026-10-05T03:10:00.000Z",
      idempotency_key: "7f04ce5d-3896-4e98-a450-70233c6f6a11",
    },
  },
  {
    id: "10241",
    occurred_at: "2026-09-05T02:16:02.000Z",
    actor_open_id: "ou_71ef6b6652b488fb",
    actor_display_name: "林运营",
    action: "plum.character.revise",
    resource_type: "plum_character_import_row",
    resource_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b:003_mei",
    plaintext: false,
    reason: "2026-09 角色补充第一批",
    request_path: "/admin/plum/imports/characters",
    metadata: {
      batch_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
      row_key: "003_mei",
      operation: "update",
      character_id: "char_02cc5e",
      work_id: "work_02cc5e",
      moderation_outcome: "pending_review",
      error_code: "",
      changed_fields: ["display_name", "opening_scene"],
    },
  },
  {
    id: "10240",
    occurred_at: "2026-09-05T02:15:44.000Z",
    actor_open_id: "ou_71ef6b6652b488fb",
    actor_display_name: "林运营",
    action: "plum.character.create",
    resource_type: "plum_character_import_row",
    resource_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b:001_luna",
    plaintext: false,
    reason: "2026-09 角色补充第一批",
    request_path: "/admin/plum/imports/characters",
    metadata: {
      batch_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
      row_key: "001_luna",
      operation: "create",
      character_id: "char_7d21a4",
      work_id: "work_7d21a4",
      moderation_outcome: "published",
      error_code: "",
      changed_fields: [],
    },
  },
  {
    id: "10239",
    occurred_at: "2026-09-05T02:14:37.000Z",
    actor_open_id: "ou_71ef6b6652b488fb",
    actor_display_name: "林运营",
    action: "plum.character.import",
    resource_type: "plum_character_import_batch",
    resource_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
    plaintext: false,
    reason: "2026-09 角色补充第一批",
    request_path: "/admin/plum/imports/characters",
    metadata: {
      batch_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
      owner_platform_user_id: "pu_9f21c8",
      row_count: 5,
    },
  },
  {
    id: "10238",
    occurred_at: "2026-09-04T11:02:19.000Z",
    actor_open_id: "ou_2f8a41cc90bb37de",
    actor_display_name: "周审核",
    action: "plum_moderation.purge",
    resource_type: "plum_moderation_review",
    resource_id: "rev_3a88",
    plaintext: false,
    reason: "确认为未成年性化内容，按红线清除",
    request_path: "/admin/plum/moderation/reviews/rev_3a88/decision",
    metadata: { character_id: "char_9911fe", decision: "purge" },
  },
  {
    id: "10237",
    occurred_at: "2026-09-04T10:58:03.000Z",
    actor_open_id: "ou_2f8a41cc90bb37de",
    actor_display_name: "周审核",
    action: "plum_moderation.view_review",
    resource_type: "plum_moderation_review",
    resource_id: "rev_3a88",
    plaintext: true,
    reason: "处置前核对送审正文",
    request_path: "/admin/plum/moderation/reviews/rev_3a88",
    metadata: { character_id: "char_9911fe" },
  },
  {
    id: "10236",
    occurred_at: "2026-09-04T10:57:41.000Z",
    // 已删号的操作者：审计仍然读得出来，只是没有人名。
    actor_open_id: "ou_a0c31d77b2e94f10",
    actor_display_name: null,
    action: "plum_moderation.claim",
    resource_type: "plum_moderation_review",
    resource_id: "rev_3a88",
    plaintext: false,
    reason: null,
    request_path: "/admin/plum/moderation/reviews/rev_3a88/claim",
    metadata: { character_id: "char_9911fe" },
  },
];

export function fixtureAuditEvents(query: AuditListQuery): {
  data: AuditEvent[];
  page: { limit: number; next_cursor: string | null; has_more: boolean };
} {
  const limit = query.limit ?? 50;
  const offset = Number.parseInt(query.cursor ?? "0", 10) || 0;
  const matched = EVENTS.filter(
    (event) =>
      (!query.actor || event.actor_open_id === query.actor) &&
      (!query.action || event.action === query.action) &&
      (query.plaintext === undefined || event.plaintext === query.plaintext),
  );
  const page = matched.slice(offset, offset + limit);
  const hasMore = offset + limit < matched.length;
  return {
    data: page,
    page: { limit, next_cursor: hasMore ? String(offset + limit) : null, has_more: hasMore },
  };
}
