import type { ModerationReviewSummary } from "../admin-resources/contracts";

type Tone = "good" | "warn" | "bad" | "muted";

export const REVIEW_STATUS_LABELS: Record<ModerationReviewSummary["status"], string> = {
  pending: "待认领",
  reviewing: "审核中",
  released: "已放出",
  confined: "已自见",
  // 「下架」现在专指运营侧那条可逆入口（见 features/characters 的下架与恢复）。复核的
  // purge 会擦掉正文、删掉图片字节且不可撤销，两者必须在文案上分开，否则运营会拿最重的
  // 那把锤子去干最日常的活。
  purged: "已清除",
};

export const HOLD_LABELS: Record<ModerationReviewSummary["moderation_hold"], string> = {
  none: "无限制",
  pending: "待审自见",
  confined: "锁定自见",
};

export const DECISION_LABELS = {
  release: "通过 · 放出",
  confine: "不通过 · 自见",
  purge: "高危清除 · 不保留",
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
 * 词表本体已移到 `admin-resources`：角色下架/恢复也要用同一份，留在 moderation 下会让
 * `admin-resources` 反向依赖 `moderation`。这里保留 re-export，复核侧的 import 不用改。
 */
export { REASON_CODE_SUGGESTIONS } from "../admin-resources/reason-codes";
