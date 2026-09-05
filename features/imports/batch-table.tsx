import Link from "next/link";
import type { AdminApiError } from "../../lib/bff/client";
import { formatDateTime } from "../admin-sections/presentation";
import type { ImportBatch } from "./import-contracts";
import { batchCounts } from "./import-contracts";
import styles from "./imports.module.css";

/** 四类计数固定按同一顺序排，跨行才能扫着比较。零值也留着位置。 */
const COUNT_COLUMNS = [
  { key: "published", label: "已发布", tone: "good" },
  { key: "pending_review", label: "待复核", tone: "warn" },
  { key: "rejected", label: "被拒", tone: "bad" },
  { key: "failed", label: "失败", tone: "bad" },
] as const;

function Counts({ batch }: { batch: ImportBatch }) {
  const counts = batchCounts(batch);
  const settled = counts.published + counts.pending_review + counts.rejected + counts.failed;
  return (
    <div className={styles.countRow}>
      {COUNT_COLUMNS.map((column) => {
        const value = counts[column.key];
        return (
          <span
            key={column.key}
            className={value > 0 ? styles[column.tone] : styles.countZero}
            title={column.label}
          >
            {column.label} {value}
          </span>
        );
      })}
      {/* 还在跑的批次计数不齐，写明白差多少行，免得被当成漏了行。 */}
      {batch.status === "running" && settled < batch.row_count && (
        <small className={styles.countPending}>{batch.row_count - settled} 行处理中</small>
      )}
    </div>
  );
}

export function BatchTable({
  batches,
  label,
  emptyHint,
  error,
}: {
  batches: readonly ImportBatch[];
  label: string;
  emptyHint: string;
  error?: AdminApiError;
}) {
  return (
    <section className={`${styles.table} ${styles.batchTable}`} aria-label={label}>
      <table>
        <thead>
          <tr>
            <th>批次</th>
            <th>状态</th>
            <th>结果</th>
            <th>行数</th>
            <th>归属账号 / 操作员</th>
            <th>导入原因</th>
          </tr>
        </thead>
        <tbody>
          {error || batches.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className={styles.empty}>
                  <span className={error ? styles.errorMark : styles.emptyMark}>{error?.status ?? "--"}</span>
                  <strong>{error ? "台账加载失败" : "还没有导入记录"}</strong>
                  <small>{error?.message ?? emptyHint}</small>
                </div>
              </td>
            </tr>
          ) : (
            batches.map((batch) => (
              <tr key={batch.batch_id}>
                <td>
                  <div className={styles.identity}>
                    <Link href={`/imports/${encodeURIComponent(batch.batch_id)}`}>
                      {formatDateTime(batch.created_at)}
                    </Link>
                    <code>{batch.batch_id}</code>
                  </div>
                </td>
                <td>
                  <span className={`${styles.badge} ${batch.status === "running" ? styles.warn : styles.muted}`}>
                    {batch.status === "running" ? "进行中" : "已完成"}
                  </span>
                </td>
                <td>
                  <Counts batch={batch} />
                </td>
                <td>{batch.row_count}</td>
                <td>
                  <div className={styles.identity}>
                    <code>{batch.owner_platform_user_id}</code>
                    <small>{batch.operator_open_id}</small>
                  </div>
                </td>
                <td>{batch.reason}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
