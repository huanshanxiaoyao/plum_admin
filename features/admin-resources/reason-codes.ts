/**
 * 处置原因码的**临时**前端词表。
 *
 * 后端只校验长度（<= 80），产品文档尚未冻结原因码口径——它应当随机审 label 收口决议
 * 一起定稿并写进 `moderation_label_policy.md`。在那之前这里保持可选 + 允许自填，
 * 避免前端单方面把一份没有依据的枚举变成事实契约。
 *
 * 放在 `admin-resources` 而不是 `moderation`：内容复核和角色下架/恢复都要用同一份词表，
 * 让 `admin-resources` 反向 import `moderation` 会把依赖方向拧成环。
 */
export const REASON_CODE_SUGGESTIONS = [
  "sexual_content",
  "minor_safety",
  "violence_terror",
  "contraband",
  "political",
  "inappropriate",
  "religion",
  "promotion",
  "impersonation",
  "other",
] as const;

/**
 * 角色下架/恢复的原因码。
 *
 * 与复核共用大部分违规类目，但两端各有自己才用得上的条目：下架多出「权利人投诉」这类
 * 运营侧来源，恢复则是申诉/误判/整改后重新上架——用复核那份词表描述恢复只会全是 `other`。
 */
export const TAKEDOWN_REASON_CODES = [
  "rights_complaint",
  "policy_violation",
  ...REASON_CODE_SUGGESTIONS,
] as const;

export const RESTORE_REASON_CODES = [
  "appeal_accepted",
  "takedown_mistake",
  "content_rectified",
  "other",
] as const;
