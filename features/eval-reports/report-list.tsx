import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileWarning } from "lucide-react";
import { daysUntilExpiry } from "../../lib/eval-reports/config.ts";
import type { EvalReportListing, EvalReportSummary } from "../../lib/eval-reports/store.ts";
import styles from "./report-list.module.css";

const MODE_LABELS: Record<EvalReportSummary["mode"], string> = {
  A: "模式 A · 固定桩",
  B: "模式 B · 真实抽取",
  C: "模式 C · 全真实",
  inspect: "只读诊断",
};

/** 被评测的对象：轨迹评测是一条合成轨迹，只读诊断是一个真实 connection。 */
function subjectOf(report: EvalReportSummary): string {
  return report.mode === "inspect" ? report.connectionId : report.trajectory;
}

function modelOf(report: EvalReportSummary): string {
  // 诊断只读状态并现场编译一轮 Context，一次模型都不调。
  return report.mode === "inspect" ? "不调模型" : report.model;
}

function ExpiryNote({ generatedAt }: { generatedAt: string }) {
  const days = daysUntilExpiry(generatedAt);
  if (days === null) return null;
  return (
    <span className={`${styles.badge} ${styles.plaintext}`}>
      <AlertTriangle size={10} aria-hidden />{" "}
      {days === 0 ? "含真实用户正文 · 即将清除" : `含真实用户正文 · ${days} 天后清除`}
    </span>
  );
}

/**
 * 发布端写的是 ISO 时刻。这里按 UTC 定点渲染，而不是本地时区——服务端与浏览器时区不同会
 * 造成 hydration 不一致，而且评测报告的时刻本来就该有一个所有人一致的读法。
 * 解析不出来就原样显示：manifest 是别处写的，看不懂也不该把整行吞掉。
 */
function formatGeneratedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function FindingsCell({ findings }: { findings: EvalReportSummary["findings"] }): ReactNode {
  const total = findings.high + findings.medium + findings.low;
  if (total === 0) return <span className={styles.mono}>无发现</span>;
  return (
    <>
      {findings.high > 0 && <span className={`${styles.badge} ${styles.high}`}>high {findings.high}</span>}{" "}
      {findings.medium > 0 && (
        <span className={`${styles.badge} ${styles.medium}`}>medium {findings.medium}</span>
      )}{" "}
      {findings.low > 0 && <span className={`${styles.badge} ${styles.low}`}>low {findings.low}</span>}
    </>
  );
}

export function EvalReportList({ listing }: { listing: EvalReportListing }): ReactNode {
  const { reports, skipped } = listing;
  return (
    <div className={styles.page}>
      <Link className={styles.backLink} href="/">
        <ArrowLeft size={13} aria-hidden /> 返回 Plum 后台
      </Link>
      <header className={styles.pageHeader}>
        <span>ENGINEERING</span>
        <h1>记忆评测</h1>
        <p>
          由 ai4all_bridge 离线跑出、发布到本机的评测报告。报告是自包含单文件，在独立沙箱里打开，
          不接触后台会话。轨迹评测跑的是合成对话；只读诊断读的是真实会话，因此到期自动清除。
        </p>
      </header>

      {skipped > 0 && (
        <p className={styles.notice}>
          <FileWarning size={14} aria-hidden />
          有 {skipped} 个目录的 manifest 缺失或不合法，已跳过。重新发布一次即可恢复。
        </p>
      )}

      {reports.length === 0 ? (
        <p className={styles.empty}>还没有发布过评测报告。</p>
      ) : (
        <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">运行</th>
              <th scope="col">对象</th>
              <th scope="col">模式</th>
              <th scope="col">模型</th>
              <th scope="col">发现</th>
              <th scope="col">生成时间</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.runId}>
                <td>
                  <Link className={styles.runLink} href={`/eval/${encodeURIComponent(report.runId)}`}>
                    {report.runId}
                  </Link>
                  {report.containsUserPlaintext && (
                    <>
                      {" "}
                      <ExpiryNote generatedAt={report.generatedAt} />
                    </>
                  )}
                </td>
                <td className={styles.mono}>{subjectOf(report)}</td>
                <td className={styles.nowrap}>{MODE_LABELS[report.mode]}</td>
                <td className={styles.mono}>{modelOf(report)}</td>
                <td>
                  <FindingsCell findings={report.findings} />
                </td>
                <td className={styles.mono}>{formatGeneratedAt(report.generatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
