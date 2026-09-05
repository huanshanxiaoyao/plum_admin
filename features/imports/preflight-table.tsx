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

/**
 * 更新行要覆盖的那个角色，**在库里现在叫什么**。
 *
 * 更新是整行覆盖并发新版，而且没有批次回滚。`character_id` 抄成另一个同样合法的 ID
 * 时（粘贴串行、上一批清单贴错列、手敲差一位），本地校验和服务端预检全是绿的——回显
 * 操作员自己填的 ID 是自证，发现不了任何问题。只有拿库里的名字和这一行的名字并排放，
 * 人才有机会看出"我要改的是露娜，它说的是凯"。
 *
 * 改名是合法操作，所以不同名不是错误，只是需要被看见。
 */
function TargetName({ row, serverChecked }: { row: ReviewRow; serverChecked: boolean }) {
  if (!row.targetDisplayName) {
    return serverChecked ? null : <small className={styles.pendingServer}>目标名称需服务端预检</small>;
  }
  const renamed = row.displayName.trim() !== "" && row.displayName.trim() !== row.targetDisplayName;
  return (
    <small className={renamed ? styles.targetRenamed : styles.targetName}>
      {renamed ? `${row.targetDisplayName} → ${row.displayName.trim()}` : row.targetDisplayName}
    </small>
  );
}

/**
 * 上传前的本地缩略图。错配图片是**合法**的——预检和机审都不会拦"这一行配错了图"，
 * 只有人看得出来。所以它必须在提交之前出现，而不是等结果页。
 */
function Portrait({ src, path }: { src: string | undefined; path: string | null }) {
  if (!path) return <small className={styles.pendingServer}>无立绘</small>;
  if (!src) return <code className={styles.portraitMissing}>{path}</code>;
  // 包里的图不是可信来源，但它只在本地 blob URL 里渲染，不外发也不进 DOM 属性以外的地方。
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.portrait} src={src} alt={`立绘预览：${path}`} loading="lazy" />;
}

function Row({
  row,
  serverChecked,
  portraitSrc,
}: {
  row: ReviewRow;
  serverChecked: boolean;
  portraitSrc: string | undefined;
}) {
  return (
    <tr className={row.blocked ? styles.rowBlocked : undefined}>
      <td>
        <div className={styles.rowIdentity}>
          <Portrait src={portraitSrc} path={row.portraitPath} />
          <div className={styles.identity}>
            <strong>{row.displayName || "(无名称)"}</strong>
            <code>{row.rowKey}</code>
            <small>第 {row.line} 行</small>
          </div>
        </div>
      </td>
      <td>
        <span className={row.operation === "update" ? styles.opUpdate : styles.opCreate}>
          {OPERATION_LABELS[row.operation]}
        </span>
        {row.operation === "update" && (
          <div className={styles.identity}>
            <code>{row.characterId ?? (serverChecked ? "目标未解析" : "--")}</code>
            <TargetName row={row} serverChecked={serverChecked} />
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
  portraits,
}: {
  model: ReviewModel;
  serverChecked: boolean;
  /** 立绘路径 → 本地 blob URL。没解出来的行退回只显示文件名。 */
  portraits: ReadonlyMap<string, string>;
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
              <Row
                key={`${row.rowKey}-${row.line}`}
                row={row}
                serverChecked={serverChecked}
                portraitSrc={row.portraitPath ? portraits.get(row.portraitPath) : undefined}
              />
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
