import { AlertCircle, CircleCheck, Info } from "lucide-react";
import { OPERATION_LABELS } from "./labels";
import type { ReviewIssue, ReviewModel, ReviewRow } from "./review-model";
import styles from "./imports.module.css";

function BudgetBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = ratio >= 1 ? styles.barOver : ratio > 0.85 ? styles.barTight : styles.barOk;
  return (
    <div className={styles.budget} title={`${label}：${used} / ${limit}`}>
      <span className={styles.budgetLabel}>{label}</span>
      <span className={styles.budgetTrack}>
        <span className={`${styles.budgetFill} ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}

function IssueList({ issues }: { issues: readonly ReviewIssue[] }) {
  if (issues.length === 0) {
    return (
      <span className={styles.rowOk}>
        <CircleCheck size={13} />
        通过
      </span>
    );
  }
  return (
    <ul className={styles.issues}>
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className={issue.severity === "error" ? styles.issueError : styles.issueNotice}>
          {issue.severity === "error" ? <AlertCircle size={12} /> : <Info size={12} />}
          <span>
            {issue.column && <code>{issue.column}</code>}
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({ row, serverChecked }: { row: ReviewRow; serverChecked: boolean }) {
  return (
    <tr className={row.blocked ? styles.rowBlocked : undefined}>
      <td>
        <div className={styles.identity}>
          <strong>{row.displayName || "(无名称)"}</strong>
          <code>{row.rowKey}</code>
          <small>第 {row.line} 行</small>
        </div>
      </td>
      <td>
        <span className={row.operation === "update" ? styles.opUpdate : styles.opCreate}>
          {OPERATION_LABELS[row.operation]}
        </span>
        {row.operation === "update" && (
          <div className={styles.identity}>
            {/* 预检不回传目标角色名，只能把要覆盖的 ID 原样回显，让人自己核一眼。 */}
            <code>{row.characterId ?? (serverChecked ? "目标未解析" : "--")}</code>
          </div>
        )}
      </td>
      <td>
        <div className={styles.identity}>
          <code>{row.ownerPlatformUserId ?? "--"}</code>
        </div>
      </td>
      <td>
        {row.server?.prompt_budget.blocks.length ? (
          <div className={styles.budgets}>
            {row.server.prompt_budget.blocks.map((block) => (
              <BudgetBar key={block.block} label={block.block} used={block.tokens} limit={block.limit} />
            ))}
          </div>
        ) : (
          <small className={styles.pendingServer}>{serverChecked ? "--" : "需服务端预检"}</small>
        )}
      </td>
      <td>
        {row.operation === "update" && row.server?.changed_fields?.length ? (
          <div className={styles.changed}>
            {row.server.changed_fields.map((field) => (
              <code key={field}>{field}</code>
            ))}
          </div>
        ) : (
          <small className={styles.pendingServer}>--</small>
        )}
      </td>
      <td>
        <IssueList issues={row.issues} />
      </td>
    </tr>
  );
}

export function PreflightTable({
  model,
  serverChecked,
}: {
  model: ReviewModel;
  serverChecked: boolean;
}) {
  return (
    <section className={styles.table} aria-label="预检结果">
      <table>
        <thead>
          <tr>
            <th>角色</th>
            <th>操作</th>
            <th>归属账号</th>
            <th>容量占用</th>
            <th>将变更字段</th>
            <th>校验</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <div className={styles.empty}>
                  <span className={styles.emptyMark}>--</span>
                  <strong>没有可展示的行</strong>
                  <small>表格里没有解析出任何角色数据</small>
                </div>
              </td>
            </tr>
          ) : (
            model.rows.map((row) => (
              <Row key={`${row.rowKey}-${row.line}`} row={row} serverChecked={serverChecked} />
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
