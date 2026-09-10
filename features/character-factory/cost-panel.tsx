"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getRunCosts } from "./api";
import { COST_PHASE_LABELS, formatFactoryCost, formatFactoryTokens, type FactoryCostCall, type FactoryCostMetrics, type FactoryCostReport } from "./costs";
import styles from "./cost-panel.module.css";

type Props = {
  readonly runId: string;
  readonly candidateId?: string;
  readonly candidates?: readonly { readonly id: string; readonly title: string }[];
  readonly active?: boolean;
  readonly refreshKey?: string;
};

const OUTCOMES = { running: "进行中", succeeded: "完成", failed: "失败", unknown: "结果待确认" } as const;

function CostValue({ metrics }: { readonly metrics: FactoryCostMetrics }) {
  return <>{formatFactoryCost(metrics.cost_usd_micros)}{metrics.cost_usd_micros === null && metrics.known_cost_usd_micros > 0 && <small>已确认 {formatFactoryCost(metrics.known_cost_usd_micros)}</small>}</>;
}

function CostRows({ rows }: { readonly rows: readonly (FactoryCostMetrics & { readonly label: string })[] }) {
  return <div className={styles.tableScroll}><table className={styles.table}>
    <thead><tr><th scope="col">费用归属</th><th scope="col">调用</th><th scope="col">输入 token</th><th scope="col">输出 token</th><th scope="col">成本 (USD)</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${index}-${row.label}`}><td>{row.label}</td><td>{row.total_calls}</td><td>{formatFactoryTokens(row.input_tokens)}</td><td>{formatFactoryTokens(row.output_tokens)}</td><td><CostValue metrics={row} /></td></tr>)}</tbody>
  </table></div>;
}

function CallRows({ calls, names }: { readonly calls: readonly FactoryCostCall[]; readonly names: ReadonlyMap<string, string> }) {
  return <div className={styles.tableScroll}><table className={styles.table}>
    <thead><tr><th scope="col">阶段 / 归属</th><th scope="col">模型 / 尝试</th><th scope="col">执行结果</th><th scope="col">输入 / 输出 token</th><th scope="col">成本 (USD)</th></tr></thead>
    <tbody>{calls.map((call) => <tr key={call.id}>
      <td>{COST_PHASE_LABELS[call.phase] ?? call.phase}<small>{call.candidate_id ? names.get(call.candidate_id) ?? call.candidate_id : "公共费用"}</small></td>
      <td>{call.model ?? "待确认"}{call.cycle !== null && call.attempt !== null && <small>第 {call.cycle} 轮 · 第 {call.attempt} 次</small>}</td>
      <td>{OUTCOMES[call.outcome]}{call.error_code && <small>{call.error_code}</small>}</td>
      <td>{formatFactoryTokens(call.input_tokens)} / {formatFactoryTokens(call.output_tokens)}</td>
      <td>{call.status === "pending" ? "进行中" : formatFactoryCost(call.cost_usd_micros)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function FactoryCostPanel({ runId, candidateId, candidates = [], active = false, refreshKey = "" }: Props) {
  const [loaded, setLoaded] = useState<{ runId: string; report: FactoryCostReport } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const report = loaded?.runId === runId ? loaded.report : null;

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(load, 5_000);
        return;
      }
      setLoading(true);
      try {
        const response = await getRunCosts(runId, controller.signal);
        if (controller.signal.aborted) return;
        setLoaded({ runId, report: response.data });
        setError("");
        if (active || response.data.totals.pending_calls > 0) timer = setTimeout(load, 3_000);
      } catch {
        if (controller.signal.aborted) return;
        setError("成本暂时无法读取");
        if (active) timer = setTimeout(load, 5_000);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [runId, active, refreshKey, refresh]);

  if (!runId) return null;
  const names = new Map(candidates.map((candidate) => [candidate.id, candidate.title]));
  const metrics = candidateId ? report?.candidates.find((item) => item.candidate_id === candidateId) : report?.totals;
  const calls = report?.calls.filter((call) => !candidateId || call.candidate_id === candidateId) ?? [];
  const rows = report ? [
    ...(report.shared.total_calls > 0 ? [{ ...report.shared, label: "公共费用" }] : []),
    ...report.candidates.map((item) => ({ ...item, label: names.get(item.candidate_id) ?? item.candidate_id })),
  ] : [];

  return <section className={styles.panel} aria-label="调用成本">
    <header className={styles.header}><h2>调用成本</h2><button className={styles.refresh} type="button" title="刷新成本" aria-label="刷新成本" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" /></button></header>
    {error && <p className={styles.status} data-tone="warn" role="status"><AlertTriangle size={14} aria-hidden="true" />{error}{report ? " · 当前为上次读取结果" : ""}</p>}
    {!report && !error && <p className={styles.empty} role="status">正在读取成本</p>}
    {report && !report.tracking_enabled && <p className={styles.empty}>无用量记录</p>}
    {report?.tracking_enabled && metrics && <>
      <dl className={styles.metrics} aria-label="成本汇总">
        <div><dt>{metrics.cost_usd_micros === null ? "已确认成本" : candidateId ? "角色直接成本" : "累计成本"}</dt><dd>{formatFactoryCost(metrics.cost_usd_micros ?? metrics.known_cost_usd_micros)} <small>USD</small></dd></div>
        <div><dt>输入 token</dt><dd>{formatFactoryTokens(metrics.input_tokens)}</dd></div>
        <div><dt>输出 token</dt><dd>{formatFactoryTokens(metrics.output_tokens)}</dd></div>
        <div><dt>调用次数</dt><dd>{metrics.total_calls}</dd></div>
      </dl>
      {report.tracking_incomplete && <p className={styles.status} data-tone="warn" role="status">用量记录不完整{report.missing_calls > 0 ? ` · ${report.missing_calls} 次待确认` : ""}</p>}
      {(metrics.unpriced_calls > 0 || metrics.pending_calls > 0) && <p className={styles.status} data-tone="warn" role="status">{metrics.unpriced_calls > 0 ? `${metrics.unpriced_calls} 次待确认` : ""}{metrics.unpriced_calls > 0 && metrics.pending_calls > 0 ? " · " : ""}{metrics.pending_calls > 0 ? `${metrics.pending_calls} 次进行中` : ""}</p>}
      {!candidateId && rows.length > 1 && <CostRows rows={rows} />}
      {!candidateId && report.phases.length > 0 && <details className={styles.details}><summary>分阶段费用</summary><CostRows rows={report.phases.map((item) => ({ ...item, label: COST_PHASE_LABELS[item.phase] ?? item.phase }))} /></details>}
      <details className={styles.details}><summary>调用明细 ({calls.length})</summary>{calls.length ? <CallRows calls={calls} names={names} /> : <p className={styles.empty}>暂无模型调用</p>}</details>
    </>}
    {report?.tracking_enabled && candidateId && !metrics && <p className={styles.empty}>暂无角色调用记录</p>}
  </section>;
}
