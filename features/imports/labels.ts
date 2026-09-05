import type { ImportOperation, ImportRowStatus } from "./import-contracts.ts";

export type Tone = "good" | "warn" | "bad" | "muted";

export const STATUS_LABELS: Record<ImportRowStatus, string> = {
  published: "已发布",
  pending_review: "待复核",
  rejected: "被拒",
  failed: "失败",
};

/**
 * 待复核用 warn 而不是 bad。它是**正常终态**——内容已经创建好，只是等人工确认，
 * 和「被拒」「失败」染同一个颜色会让运营以为这批白干了（PRD FR-IMP-05）。
 */
export const STATUS_TONES: Record<ImportRowStatus, Tone> = {
  published: "good",
  pending_review: "warn",
  rejected: "bad",
  failed: "bad",
};

export const OPERATION_LABELS: Record<ImportOperation, string> = {
  create: "新增",
  update: "更新",
};

export const STATUS_HINTS: Record<ImportRowStatus, string> = {
  published: "角色已上线。",
  pending_review: "内容已创建，机审判定需人工确认。这期间仅归属账号自己可见，不是失败。",
  rejected: "机审判定内容不合规。修改内容后重新导入。",
  failed: "格式、冲突或依赖异常。修好后把这几行单独打包重传。",
};
