import type { ModerationReviewSummary } from "../admin-resources/contracts";

type Tone = "good" | "warn" | "bad" | "muted";

export const REVIEW_STATUS_LABELS: Record<ModerationReviewSummary["status"], string> = {
  pending: "待认领",
  reviewing: "审核中",
  released: "已放出",
  confined: "已自见",
  purged: "已下架",
};

export const HOLD_LABELS: Record<ModerationReviewSummary["moderation_hold"], string> = {
  none: "无限制",
  pending: "待审自见",
  confined: "锁定自见",
};

export const DECISION_LABELS = {
  release: "通过 · 放出",
  confine: "不通过 · 自见",
  purge: "高危下架 · 不保留",
} as const;

export function statusTone(status: ModerationReviewSummary["status"]): Tone {
  if (status === "released") return "good";
  if (status === "purged") return "bad";
  if (status === "confined") return "warn";
  return "muted";
}

export function holdTone(hold: ModerationReviewSummary["moderation_hold"]): Tone {
  if (hold === "confined") return "bad";
  if (hold === "pending") return "warn";
  return "muted";
}

/** 只有 pending / reviewing 还能被处置；其余状态是终态。 */
export function isOpenReview(status: ModerationReviewSummary["status"]): boolean {
  return status === "pending" || status === "reviewing";
}

/**
 * 处置原因码的**临时**前端词表。
 *
 * 后端只校验长度（<= 80），产品文档尚未冻结原因码口径——它应当随机审 label 收口决议
 * 一起定稿并写进 `moderation_label_policy.md`。在那之前这里保持可选 + 允许自填，
 * 避免前端单方面把一份没有依据的枚举变成事实契约。
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
