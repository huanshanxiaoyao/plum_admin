/**
 * 导入台账的**服务端**取数。
 *
 * 结果页与历史页都是 Server Component，必须走带 BFF 令牌的直连（`adminApiGet`）。
 * 浏览器侧的 `adminApiFetch` 发的是相对路径 `/api/admin/...`，在服务端没有 base URL，
 * 用在这里会在远端模式下每次都抛——fixture 模式不会走到那一步，所以本地看不出来。
 */

import "server-only";

import { adminApiGet } from "../admin-resources/data-source.ts";
import { AdminApiError } from "../../lib/bff/client.ts";
import { adminDataSourceMode } from "../../lib/bff/config.ts";
import type { ImportBatch, ImportBatchDetail } from "./import-contracts.ts";
import { fixtureBatch, fixtureBatchPage, FIXTURE_BATCHES } from "./fixtures.ts";
import { BATCHES_PER_PAGE, normalizeLimit, normalizeOffset } from "./history-paging.ts";

export { BATCHES_PER_PAGE };

export type ImportBatchPage = {
  readonly batches: readonly ImportBatch[];
  readonly offset: number;
  readonly hasMore: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBatch(value: unknown): value is ImportBatch {
  return (
    isRecord(value) &&
    typeof value.batch_id === "string" &&
    typeof value.created_at === "string" &&
    typeof value.operator_open_id === "string" &&
    typeof value.owner_platform_user_id === "string" &&
    typeof value.reason === "string" &&
    (value.status === "running" || value.status === "completed") &&
    typeof value.row_count === "number" &&
    typeof value.published_count === "number" &&
    typeof value.pending_review_count === "number" &&
    typeof value.rejected_count === "number" &&
    typeof value.failed_count === "number"
  );
}

function isRow(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.row_key === "string" &&
    (value.operation === "create" || value.operation === "update") &&
    typeof value.status === "string"
  );
}

function invalid(): never {
  throw new AdminApiError(502, "unexpected_response", "Unexpected API response.");
}

/**
 * 后端这个列表用的是 `limit` / `offset`，不是别处的游标——`page.next_cursor` 里
 * 装的其实是下一个 offset 的字符串。这里不把这个细节漏给页面，只给出 hasMore。
 */
export async function listImportBatches(offset = 0, limit = BATCHES_PER_PAGE): Promise<ImportBatchPage> {
  const safeOffset = normalizeOffset(offset);
  const safeLimit = normalizeLimit(limit);
  if (adminDataSourceMode() === "fixture") {
    return {
      batches: fixtureBatchPage(safeLimit, safeOffset),
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < FIXTURE_BATCHES.length,
    };
  }
  const body = await adminApiGet("imports", { limit: safeLimit, offset: safeOffset });
  if (!isRecord(body) || !Array.isArray(body.data) || !body.data.every(isBatch)) invalid();
  const page = isRecord(body.page) ? body.page : {};
  return {
    batches: body.data as readonly ImportBatch[],
    offset: safeOffset,
    hasMore: page.has_more === true,
  };
}

export async function getImportBatch(batchId: string): Promise<ImportBatchDetail | null> {
  if (adminDataSourceMode() === "fixture") return fixtureBatch(batchId);
  let body: unknown;
  try {
    body = await adminApiGet(`imports/${encodeURIComponent(batchId)}`);
  } catch (error) {
    // 批次不存在是正常的用户输入错误（手敲 URL），交给页面走 notFound，不是 500。
    if (error instanceof AdminApiError && error.status === 404) return null;
    throw error;
  }
  if (!isRecord(body) || !isBatch(body.data) || !Array.isArray(body.rows) || !body.rows.every(isRow)) {
    invalid();
  }
  return { batch: body.data, rows: body.rows as ImportBatchDetail["rows"] };
}
