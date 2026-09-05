import { formatCsv } from "./csv.ts";
import type { ImportBatch, ImportResultRow } from "./import-contracts.ts";

/**
 * 结果清单的列。**这个列表就是隐私边界**：只有标识与状态，没有任何正文字段。
 *
 * 它的用途是把系统生成的 `character_id` 交回运营——下一轮修订把这一列贴回源包，
 * 同一份表格就从「新增包」变成「更新包」。正文仍以运营手上的源包为准（PRD §7.8）。
 *
 * 导出在前端由结果 JSON 拼装，不设服务端端点：正文从来没有进过这份 JSON，
 * 因此结构上不可能进 CSV。要改成服务端导出，必须重新论证这条边界。
 */
export const RESULT_COLUMNS = [
  "row_key",
  "character_id",
  "owner_platform_user_id",
  "operation",
  "status",
  "error_code",
  "error_message",
] as const;

function cell(
  row: ImportResultRow,
  owner: string,
  column: (typeof RESULT_COLUMNS)[number],
): string {
  // 归属账号是批次级的，契约的逐行结果里没有这一列；从批次填进来，
  // 这样导出的表格贴回源包时仍是完整的一行。
  if (column === "owner_platform_user_id") return owner;
  const value = row[column];
  return value === null || value === undefined ? "" : String(value);
}

/** 带 BOM——运营大概率直接用 Excel 打开，不带 BOM 中文会乱码。 */
export function buildResultManifest(
  rows: readonly ImportResultRow[],
  ownerPlatformUserId: string,
): string {
  return formatCsv(
    [
      [...RESULT_COLUMNS],
      ...rows.map((row) => RESULT_COLUMNS.map((column) => cell(row, ownerPlatformUserId, column))),
    ],
    { bom: true },
  );
}

export function resultManifestFilename(batch: Pick<ImportBatch, "batch_id">): string {
  return `plum_import_result_${batch.batch_id.slice(0, 12)}.csv`;
}
