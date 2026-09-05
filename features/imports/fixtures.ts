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

/** 全绿的一批。台账里最常见的样子，也是「部分成功」的对照组。 */
const CLEAN_ROWS: readonly ImportResultRow[] = [
  {
    row_key: "001_rin",
    operation: "create",
    status: "published",
    character_id: "char_1a0c93",
    work_id: "work_1a0c93",
    review_id: null,
    version_number: 1,
    error_code: null,
    error_message: null,
  },
  {
    row_key: "002_sora",
    operation: "create",
    status: "published",
    character_id: "char_1a0c94",
    work_id: "work_1a0c94",
    review_id: null,
    version_number: 1,
    error_code: null,
    error_message: null,
  },
];

const CLEAN_COUNTS = summarize(CLEAN_ROWS);

const CLEAN_BATCH: ImportBatch = {
  batch_id: "9b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e",
  created_at: "2026-09-03T09:41:12.000Z",
  updated_at: "2026-09-03T09:42:30.000Z",
  operator_open_id: "ou_71ef6b6652b488fb",
  owner_platform_user_id: OWNER,
  reason: "2026-08 联动角色补齐",
  adult_confirmed: false,
  rights_confirmed: true,
  status: "completed",
  row_count: CLEAN_ROWS.length,
  published_count: CLEAN_COUNTS.published,
  pending_review_count: CLEAN_COUNTS.pending_review,
  rejected_count: CLEAN_COUNTS.rejected,
  failed_count: CLEAN_COUNTS.failed,
};

/**
 * 仍在跑的一批：计数还没结算完，`row_count` 大于四类计数之和。
 * 台账页必须能把这种「还没完」和「全成功」区分开，不然运营会以为漏了行。
 */
const RUNNING_BATCH: ImportBatch = {
  batch_id: "3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a87",
  created_at: "2026-09-05T03:02:55.000Z",
  updated_at: "2026-09-05T03:03:10.000Z",
  operator_open_id: "ou_2f8a41cc90bb37de",
  owner_platform_user_id: "pu_3ac770",
  reason: "官方角色第二批",
  adult_confirmed: false,
  rights_confirmed: true,
  status: "running",
  row_count: 12,
  published_count: 4,
  pending_review_count: 1,
  rejected_count: 0,
  failed_count: 0,
};

const DETAILS: readonly ImportBatchDetail[] = [
  { batch: RUNNING_BATCH, rows: [] },
  FIXTURE_DETAIL,
  { batch: CLEAN_BATCH, rows: CLEAN_ROWS },
];

/** 台账按时间倒序，最新的在最前——和后端 `GET /admin/plum/imports` 一致。 */
export const FIXTURE_BATCHES: readonly ImportBatch[] = DETAILS.map((detail) => detail.batch);

export function fixtureBatch(batchId: string): ImportBatchDetail | null {
  return DETAILS.find((detail) => detail.batch.batch_id === batchId) ?? null;
}

export function fixtureBatchPage(limit: number, offset: number): readonly ImportBatch[] {
  return FIXTURE_BATCHES.slice(offset, offset + limit);
}
