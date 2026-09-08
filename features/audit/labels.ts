/**
 * 审计动作与资源的中文标签。
 *
 * 后端只按 `plum.` / `plum_moderation.` 两个**前缀**校验，不枚举具体动作——所以这里
 * 是一份「已知动作」的展示映射，不是白名单：新增的动作照样会出现在列表里，只是暂时
 * 显示成原始 action。筛选下拉同理，能筛的是已知动作，看得见的是全部。
 */

export const ACTION_LABELS: Record<string, string> = {
  "plum.user.ban": "封禁用户",
  "plum.user.unban": "解除封禁",
  "plum.character.rating": "修改作品分级",
  "plum.wallet.manual_grant": "人工充值水晶",
  "plum.character.import": "发起批量导入",
  "plum.character.create": "导入·新建角色",
  "plum.character.revise": "导入·更新角色",
  "plum_moderation.view_review": "查看送审正文",
  "plum_moderation.claim": "认领复核",
  "plum_moderation.release": "复核·放行",
  "plum_moderation.confine": "复核·限制",
  "plum_moderation.purge": "复核·清除",
};

/** 下拉里的可筛动作。顺序按运营追查时的常用度排，不按字母序。 */
export const FILTERABLE_ACTIONS = [
  "plum.user.ban",
  "plum.user.unban",
  "plum.character.rating",
  "plum.wallet.manual_grant",
  "plum.character.import",
  "plum.character.create",
  "plum.character.revise",
  "plum_moderation.purge",
  "plum_moderation.confine",
  "plum_moderation.release",
  "plum_moderation.claim",
  "plum_moderation.view_review",
] as const;

export const RESOURCE_LABELS: Record<string, string> = {
  product_membership: "用户权限",
  plum_character: "角色作品",
  entitlement_ledger: "水晶账本流水",
  plum_character_import_batch: "导入批次",
  plum_character_import_row: "导入行",
  plum_moderation_review: "复核单",
};

/** metadata 里已知键的中文名。未知键原样显示键名——多出来的东西要看得见。 */
export const METADATA_LABELS: Record<string, string> = {
  before: "修改前",
  after: "修改后",
  content_version: "内容版本",
  batch_id: "批次",
  row_key: "行标识",
  operation: "操作",
  character_id: "角色",
  work_id: "作品",
  moderation_outcome: "机审结果",
  error_code: "错误码",
  changed_fields: "改动字段",
  row_count: "行数",
  owner_platform_user_id: "归属账号",
  review_id: "复核单",
  decision: "处置",
  platform_user_id: "用户 ID",
  amount: "充值数量",
  amount_micros: "充值微单位",
  balance_before: "充值前余额",
  balance_after: "充值后余额",
  validity_days: "有效天数",
  expires_at: "到期时间",
  idempotency_key: "幂等键",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function resourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? resourceType;
}
