/**
 * 评测报告产物的只读读取层。
 *
 * 产物由 `ai4all_bridge` 的 `make plum-memory-eval-publish` 推送到
 * `ADMIN_EVAL_REPORTS_DIR` 之下，每次运行一个目录：
 *
 * ```text
 * <root>/<run-id>/manifest.json   无明文摘要，列表页只读它
 * <root>/<run-id>/report.html     自包含报告，含正文
 * ```
 *
 * 本模块**只读文件系统，不连后端、不发请求**。列表页刻意不解析 `report.html`：
 * 摘要必须来自无明文的 manifest，否则「无明文的指标可以单独传阅」这条纪律在查看侧就断了。
 */

import { readFile, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { evalReportsDir } from "./config.ts";

export const REPORT_FILE = "report.html";
export const MANIFEST_FILE = "manifest.json";

/** 一次评测运行的无明文摘要，字段与发布端的 manifest.v1 一一对应。 */
export type EvalReportSummary = {
  runId: string;
  trajectory: string;
  /** 轨迹评测的 A/B/C，或只读诊断的 inspect。 */
  mode: "A" | "B" | "C" | "inspect";
  model: string;
  generatedAt: string;
  findings: { high: number; medium: number; low: number };
  /**
   * 报告正文是否含真实用户对话。轨迹评测跑的是合成数据（`datasets/dev_synthetic/`），
   * 只读诊断跑的是真实会话——两者的留存策略不同，因此这个事实必须随产物一起传过来，
   * 而不是由查看器猜。
   */
  containsUserPlaintext: boolean;
};

export type EvalReportListing = {
  reports: readonly EvalReportSummary[];
  /** manifest 缺失或不合法的目录数。计数出现在页面上，避免产物坏掉时静默少一行。 */
  skipped: number;
};

// run id 直接参与路径拼接，因此只接受一个安全的路径片段：没有分隔符、没有 `..`、没有控制字符。
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export function isSafeRunId(runId: string): boolean {
  return runId !== "." && runId !== ".." && SAFE_RUN_ID.test(runId);
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);
}

function asFindings(value: unknown): EvalReportSummary["findings"] | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const counts = ["high", "medium", "low"].map((key) => record[key]);
  if (!counts.every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0)) {
    return null;
  }
  const [high, medium, low] = counts as number[];
  return { high, medium, low };
}

/**
 * 解析一份 manifest。字段缺失或类型不对一律返回 null 由调用方跳过——
 * 宁可少列一行并计数，也不要让一个坏产物把整页打成 500。
 */
export function parseManifest(runId: string, raw: unknown): EvalReportSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  // run_id 必须与目录名一致：产物被改名或错放时，这是最便宜的一道完整性检查。
  if (record.run_id !== runId) return null;
  const mode = record.mode;
  if (mode !== "A" && mode !== "B" && mode !== "C" && mode !== "inspect") return null;
  const findings = asFindings(record.findings);
  if (!findings) return null;
  if (typeof record.contains_user_plaintext !== "boolean") return null;
  const strings = ["trajectory", "model", "generated_at"].map((key) => record[key]);
  if (!strings.every((value) => typeof value === "string" && value.length > 0)) return null;
  const [trajectory, model, generatedAt] = strings as string[];
  return {
    runId,
    trajectory,
    mode,
    model,
    generatedAt,
    findings,
    containsUserPlaintext: record.contains_user_plaintext,
  };
}

/** 列出全部已发布的运行，按生成时间倒序。开关未配置或目录不存在时返回空列表。 */
export async function listEvalReports(): Promise<EvalReportListing> {
  const root = evalReportsDir();
  if (!root) return { reports: [], skipped: 0 };

  let rootReal: string;
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    rootReal = await realpath(root);
    entries = await readdir(rootReal, { withFileTypes: true });
  } catch {
    // 目录尚未创建（还没发布过任何一次运行）与目录不可读，对查看器是同一件事：没有东西可列。
    return { reports: [], skipped: 0 };
  }

  const reports: EvalReportSummary[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeRunId(entry.name)) continue;
    let manifest: EvalReportSummary | null = null;
    try {
      const raw = await readFile(join(rootReal, entry.name, MANIFEST_FILE), "utf8");
      manifest = parseManifest(entry.name, JSON.parse(raw));
    } catch {
      manifest = null;
    }
    if (manifest) reports.push(manifest);
    else skipped += 1;
  }
  reports.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  return { reports, skipped };
}

/**
 * 读取一次运行的报告正文。
 *
 * 先 `realpath` 再比对前缀：符号链接指向根目录之外时会在这里被挡住，
 * 而不是被「拼接前看着像个安全片段」骗过去。
 */
export async function readEvalReportHtml(runId: string): Promise<string | null> {
  const root = evalReportsDir();
  if (!root || !isSafeRunId(runId)) return null;
  try {
    const rootReal = await realpath(root);
    const targetReal = await realpath(join(rootReal, runId, REPORT_FILE));
    if (!isWithin(rootReal, targetReal)) return null;
    return await readFile(targetReal, "utf8");
  } catch {
    return null;
  }
}
