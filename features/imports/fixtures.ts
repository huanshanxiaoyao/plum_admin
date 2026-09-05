import type { ImportBatch, ImportBatchDetail, ImportResultRow } from "./import-contracts.ts";
import { summarize } from "./import-contracts.ts";

const OWNER = "pu_9f21c8";

/**
 * 结果页的 fixture。刻意做成**四种终态齐全的部分成功**——全绿的样例看不出
 * 「部分成功」和「全部成功」在视觉上有没有区分开，而那正是这一页最容易做砸的地方。
 */
const ROWS: readonly ImportResultRow[] = [
  {
    row_key: "001_luna",
    operation: "create",
    status: "published",
    character_id: "char_7d21a4",
    work_id: "work_7d21a4",
    review_id: null,
    version_number: 1,
    error_code: null,
    error_message: null,
  },
  {
    row_key: "002_kai",
    operation: "create",
    status: "pending_review",
    character_id: "char_b81f30",
    work_id: "work_b81f30",
    review_id: "rev_3a91",
    version_number: 1,
    error_code: null,
    error_message: null,
  },
  {
    row_key: "003_mei",
    operation: "update",
    status: "pending_review",
    character_id: "char_02cc5e",
    work_id: "work_02cc5e",
    review_id: "rev_3a92",
    version_number: 8,
    error_code: null,
    error_message: null,
  },
  {
    row_key: "004_zed",
    operation: "create",
    status: "rejected",
    character_id: null,
    work_id: null,
    review_id: null,
    version_number: null,
    error_code: "moderation_rejected",
    error_message: "机审判定内容不合规：sexual_minor",
  },
  {
    row_key: "005_ivy",
    operation: "update",
    status: "failed",
    character_id: "char_5f0aa1",
    work_id: null,
    review_id: null,
    version_number: null,
    error_code: "revision_conflict",
    error_message: "该角色在预检后被修改过，请重新预检再提交，不要直接重试",
  },
];

const COUNTS = summarize(ROWS);

export const FIXTURE_BATCH: ImportBatch = {
  batch_id: "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b",
  created_at: "2026-09-05T02:14:37.000Z",
  updated_at: "2026-09-05T02:16:02.000Z",
  operator_open_id: "ou_71ef6b6652b488fb",
  owner_platform_user_id: OWNER,
  reason: "2026-09 角色补充第一批",
  adult_confirmed: true,
  rights_confirmed: true,
  status: "completed",
  row_count: ROWS.length,
  published_count: COUNTS.published,
  pending_review_count: COUNTS.pending_review,
  rejected_count: COUNTS.rejected,
  failed_count: COUNTS.failed,
};

export const FIXTURE_DETAIL: ImportBatchDetail = { batch: FIXTURE_BATCH, rows: ROWS };

export function fixtureBatch(batchId: string): ImportBatchDetail | null {
  return batchId === FIXTURE_BATCH.batch_id ? FIXTURE_DETAIL : null;
}

export const FIXTURE_BATCHES: readonly ImportBatch[] = [FIXTURE_BATCH];
