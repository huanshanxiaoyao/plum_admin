/**
 * 台账翻页的纯算术。单独放一个文件，是为了能在不拉起 `server-only` 数据源的情况下测。
 *
 * 后端这个列表接口用 `limit` / `offset`，和别处的游标分页不是一回事——手敲 URL 里
 * 出现负数、非数字、超大 offset 都得当成第一页，不能直接透传给后端。
 */

/** 一页多少批。台账是回溯用的，翻页比无限滚动更容易「回到我上次看的那一页」。 */
export const BATCHES_PER_PAGE = 20;

const MAX_OFFSET = 10_000;

export function normalizeOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_OFFSET);
}

export function normalizeLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return BATCHES_PER_PAGE;
  return Math.min(200, Math.max(1, parsed));
}

/** 上一页可能落在非整页边界（offset 是手敲的），负数一律回到第一页。 */
export function historyHref(offset: number): string {
  return offset <= 0 ? "/imports/batches" : `/imports/batches?offset=${offset}`;
}
