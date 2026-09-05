/**
 * 导入接口的请求与响应类型，**全部取自生成契约**。
 *
 * 这里不再有手写形状。所有别名都指向 `contracts/generated/admin-api.ts`，
 * 后端改契约、`npm run contract:check` 变红、typecheck 跟着报错——漂移会在
 * 合并前被挡住，而不是上线后由运营发现。
 */

import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";

type Schemas = AdminApiComponents["schemas"];

export type ImportOperation = Schemas["AdminImportRowResult"]["operation"];

/** `pending_review` 是正常终态，不计入失败（PRD FR-IMP-05）。 */
export type ImportRowStatus = Schemas["AdminImportRowResult"]["status"];

export type ImportIssue = Schemas["AdminImportIssue"];
export type PromptBlock = Schemas["AdminImportPromptBlock"];
export type PromptBudget = Schemas["AdminImportPromptBudget"];
export type CropRect = Schemas["AdminImportCropRect"];
export type MediaUploadRequest = Schemas["AdminImportMediaUploadRequest"];
export type ImageSetRequest = Schemas["AdminImportImageSetRequest"];

export type PreflightRow = Schemas["AdminImportPreflightRow"];
export type PreflightRequest = Schemas["AdminImportPreflightRequest"];
export type PreflightResponse = Schemas["AdminImportPreflightResponse"];

export type ImportRowPayload = Schemas["AdminImportRow"];
export type ImportExecuteRequest = Schemas["AdminImportExecuteRequest"];
export type ImportResultRow = Schemas["AdminImportRowResult"];

/** 批次台账。计数是**平铺**在批次上的，不是嵌套的 summary 对象。 */
export type ImportBatch = Schemas["AdminImportBatchItem"];

export type ImportBatchResponse = Schemas["AdminImportBatchDetailResponse"];
export type ImportExecuteResponse = Schemas["AdminImportExecuteResponse"];

/**
 * 契约里 `rows` 与 `data` 是**平级**的两个字段，不是 `data.rows`。
 * 页面只需要「一个批次连同它的行」这一个概念，所以在边界上合成一次，
 * 免得每个消费方都记住这个形状。
 */
export type ImportBatchDetail = {
  readonly batch: ImportBatch;
  readonly rows: readonly ImportResultRow[];
};

export function toBatchDetail(
  response: ImportBatchResponse | ImportExecuteResponse,
): ImportBatchDetail {
  return { batch: response.data, rows: response.rows };
}

export type ImportSummary = {
  readonly published: number;
  readonly pending_review: number;
  readonly rejected: number;
  readonly failed: number;
};

/** 从逐行结果数一遍。用于 fixture 自洽性校验，以及行数据比台账更可信时的兜底。 */
export function summarize(rows: readonly ImportResultRow[]): ImportSummary {
  return {
    published: rows.filter((row) => row.status === "published").length,
    pending_review: rows.filter((row) => row.status === "pending_review").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    failed: rows.filter((row) => row.status === "failed").length,
  };
}

/** 台账上的计数。批次仍在 running 时它比逐行统计更权威（行还没写完）。 */
export function batchCounts(batch: ImportBatch): ImportSummary {
  return {
    published: batch.published_count,
    pending_review: batch.pending_review_count,
    rejected: batch.rejected_count,
    failed: batch.failed_count,
  };
}

export function isSuccessful(status: ImportRowStatus): boolean {
  return status === "published" || status === "pending_review";
}
