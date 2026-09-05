import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentIdentity } from "../../lib/auth/session";
import { formatDateTime } from "../admin-sections/presentation";
import { canUseImports } from "./access";
import { getImportBatch } from "./data-source";
import { batchCounts } from "./import-contracts";
import { STATUS_HINTS, STATUS_LABELS, STATUS_TONES, OPERATION_LABELS } from "./labels";
import { ResultExport } from "./result-export-button";
import styles from "./imports.module.css";

type Params = Promise<{ batchId: string }>;

export async function ImportResultPage({ params }: { params: Params }) {
  const { batchId } = await params;
  const identity = await getCurrentIdentity();
  if (!identity || !canUseImports(identity.capabilities)) notFound();

  const detail = await getImportBatch(batchId);
  if (!detail) notFound();

  const { batch, rows } = detail;
  const counts = batchCounts(batch);
  const succeeded = counts.published + counts.pending_review;
  const partial = succeeded > 0 && rows.length > succeeded;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <Link className={styles.back} href="/imports">
            <ArrowLeft size={14} />
            角色导入
          </Link>
          <h1>导入结果</h1>
          <p>
            <code>{batch.batch_id}</code> · {formatDateTime(batch.created_at)} · {batch.reason}
          </p>
        </div>
        <div className={styles.headerActions}>
          <ResultExport detail={detail} />
        </div>
      </header>

      {/* 「部分成功」必须一眼看出来，不能和「全部成功」长得一样（PRD §8）。 */}
      <dl className={`${styles.summary} ${partial ? styles.summaryPartial : ""}`} aria-label="结果汇总">
        <div className={styles.good}>
          <dt>已发布</dt>
          <dd>{counts.published}</dd>
        </div>
        <div className={styles.warn}>
          <dt>待复核</dt>
          <dd>{counts.pending_review}</dd>
        </div>
        <div className={styles.bad}>
          <dt>被拒</dt>
          <dd>{counts.rejected}</dd>
        </div>
        <div className={styles.bad}>
          <dt>失败</dt>
          <dd>{counts.failed}</dd>
        </div>
      </dl>

      {counts.pending_review > 0 && (
        <p className={styles.reviewNote}>
          <strong>待复核不是失败。</strong>
          {STATUS_HINTS.pending_review}
          <Link href="/moderation">
            前往内容复核
            <ExternalLink size={12} />
          </Link>
        </p>
      )}

      <section className={styles.table} aria-label="逐行结果">
        <table>
          <thead>
            <tr>
              <th>行标识</th>
              <th>操作</th>
              <th>状态</th>
              <th>角色 ID</th>
              <th>归属账号</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.row_key}>
                <td>
                  <div className={styles.identity}>
                    <code>{row.row_key}</code>
                  </div>
                </td>
                <td>
                  <span className={row.operation === "update" ? styles.opUpdate : styles.opCreate}>
                    {OPERATION_LABELS[row.operation]}
                  </span>
                </td>
                <td>
                  <span className={`${styles.badge} ${styles[STATUS_TONES[row.status]]}`}>
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td>
                  <div className={styles.identity}>
                    {row.character_id ? (
                      <Link href={`/characters/${encodeURIComponent(row.character_id)}`}>
                        {row.character_id}
                      </Link>
                    ) : (
                      <code>--</code>
                    )}
                    {row.version_number != null && <small>v{row.version_number}</small>}
                  </div>
                </td>
                <td>
                  <div className={styles.identity}>
                    <code>{batch.owner_platform_user_id}</code>
                  </div>
                </td>
                <td>
                  {row.error_message ? (
                    <div className={styles.identity}>
                      <small className={styles.issueError}>{row.error_message}</small>
                      {row.error_code && <code>{row.error_code}</code>}
                    </div>
                  ) : (
                    <small>{STATUS_HINTS[row.status]}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className={styles.specNote}>
        导出结果清单，把 <code>character_id</code> 列贴回<strong>源包</strong>，下次同一份表格就能用来更新。
        清单只含标识与状态，不含角色正文——正文以你手上的源包为准。
      </p>
    </div>
  );
}
