/**
 * 评测报告产物的只读读取层。
 *
 * 产物由 `ai4all_bridge` 的 `make plum-memory-eval-publish` 推送到
 * `ADMIN_EVAL_REPORTS_DIR` 之下。**两类产物分两层放，因为明文性质不同：**
 *
 * ```text
 * <root>/<run-id>/manifest.json            轨迹评测：跑的是合成对话，长期留存
 * <root>/<run-id>/report.html
 * <root>/_inspect/<run-id>/manifest.json   只读诊断：读的是真实用户会话，到期清除
 * <root>/_inspect/<run-id>/inspection.html
 * ```
 *
 * 正文文件名跟着来源走，发布端不改名，因此这里两个名字都认。
 *
 * 本模块**只读文件系统，不连后端、不发请求，也不删除任何东西**。列表页刻意不解析正文
 * HTML：摘要必须来自无明文的 manifest，否则「无明文的指标可以单独传阅」这条纪律在查看侧
 * 就断了。到期清理由 `deploy/eval-inspect-sweep.mjs` 单独负责，它复用这里的列举与路径
 * 解析，好让「页面上说还剩几天」与「清理任务什么时候删」按同一份输入计算。
 */

import { readFile, readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { evalReportsDir } from "./config.ts";

export const REPORT_FILE = "report.html";
export const INSPECTION_FILE = "inspection.html";
export const MANIFEST_FILE = "manifest.json";

/** 诊断产物所在的子目录。以下划线开头，与 run id 的命名空间不会撞。 */
export const INSPECT_PREFIX = "_inspect";

export type EvalReportArea = "trajectory" | "inspect";

type EvalReportCommon = {
  runId: string;
  area: EvalReportArea;
  generatedAt: string;
  findings: { high: number; medium: number; low: number };
  /**
   * 报告正文是否含真实用户对话。轨迹评测跑的是合成数据（`datasets/dev_synthetic/`），
   * 只读诊断跑的是真实会话——这个事实必须随产物一起传过来，而不是由查看器猜。
   */
  containsUserPlaintext: boolean;
};

/**
 * 一次评测运行的无明文摘要。
 *
 * 两类产物的字段本就不同，因此按 `mode` 分成联合类型，而不是把缺的字段填成占位值：
 * 诊断一次模型都不调，硬给它一个 `model` 等于让 manifest 说谎。
 */
export type EvalReportSummary =
  | (EvalReportCommon & { mode: "A" | "B" | "C"; trajectory: string; model: string })
  | (EvalReportCommon & { mode: "inspect"; connectionId: string });

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

function asFindings(value: unknown): EvalReportCommon["findings"] | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const counts = ["high", "medium", "low"].map((key) => record[key]);
  if (!counts.every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0)) {
    return null;
  }
  const [high, medium, low] = counts as number[];
  return { high, medium, low };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * 解析一份 manifest。字段缺失或类型不对一律返回 null 由调用方跳过——
 * 宁可少列一行并计数，也不要让一个坏产物把整页打成 500。
 */
export function parseManifest(
  runId: string,
  area: EvalReportArea,
  raw: unknown,
): EvalReportSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  // run_id 必须与目录名一致：产物被改名或错放时，这是最便宜的一道完整性检查。
  if (record.run_id !== runId) return null;
  const findings = asFindings(record.findings);
  if (!findings) return null;
  const generatedAt = nonEmptyString(record.generated_at);
  if (!generatedAt) return null;
  if (typeof record.contains_user_plaintext !== "boolean") return null;

  const mode = record.mode;
  // 目录层与 mode 必须一致：轨迹报告躺在 _inspect/ 下会被当成会过期的东西而被清掉，
  // 诊断报告躺在根下则永远不会被清掉——两种错法都很难在事后看出来。
  if ((mode === "inspect") !== (area === "inspect")) return null;

  const common: EvalReportCommon = {
    runId,
    area,
    generatedAt,
    findings,
    containsUserPlaintext: record.contains_user_plaintext,
  };

  if (mode === "inspect") {
    const connectionId = nonEmptyString(record.connection_id);
    if (!connectionId) return null;
    // 诊断读的就是真实会话。这里为 false 只能是产物被改过，而它会让页面不再提示过期。
    if (!common.containsUserPlaintext) return null;
    return { ...common, mode, connectionId };
  }
  if (mode !== "A" && mode !== "B" && mode !== "C") return null;
  const trajectory = nonEmptyString(record.trajectory);
  const model = nonEmptyString(record.model);
  if (!trajectory || !model) return null;
  return { ...common, mode, trajectory, model };
}

async function collect(dir: string, area: EvalReportArea): Promise<EvalReportListing> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // 目录尚未创建（还没发布过这一类产物）与目录不可读，对查看器是同一件事：没有东西可列。
    return { reports: [], skipped: 0 };
  }
  const reports: EvalReportSummary[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeRunId(entry.name)) continue;
    let manifest: EvalReportSummary | null = null;
    try {
      const raw = await readFile(join(dir, entry.name, MANIFEST_FILE), "utf8");
      manifest = parseManifest(entry.name, area, JSON.parse(raw));
    } catch {
      manifest = null;
    }
    if (manifest) reports.push(manifest);
    else skipped += 1;
  }
  return { reports, skipped };
}

/** 列出全部已发布的运行（含诊断），按生成时间倒序。开关未配置时返回空列表。 */
export async function listEvalReports(): Promise<EvalReportListing> {
  const root = evalReportsDir();
  if (!root) return { reports: [], skipped: 0 };

  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return { reports: [], skipped: 0 };
  }

  const [trajectories, inspections] = await Promise.all([
    collect(rootReal, "trajectory"),
    collect(join(rootReal, INSPECT_PREFIX), "inspect"),
  ]);
  const reports = [...trajectories.reports, ...inspections.reports];
  reports.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  return { reports, skipped: trajectories.skipped + inspections.skipped };
}

/**
 * 一次运行的产物目录（绝对路径），不存在时返回 null。
 *
 * 先 `realpath` 再比对前缀：符号链接指向根目录之外时会在这里被挡住，
 * 而不是被「拼接前看着像个安全片段」骗过去。
 */
export async function resolveRunDir(
  runId: string,
  area?: EvalReportArea,
): Promise<string | null> {
  const root = evalReportsDir();
  if (!root || !isSafeRunId(runId)) return null;
  const areas: readonly EvalReportArea[] = area ? [area] : ["trajectory", "inspect"];
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return null;
  }
  for (const candidate of areas) {
    const path = candidate === "inspect"
      ? join(rootReal, INSPECT_PREFIX, runId)
      : join(rootReal, runId);
    try {
      const resolved = await realpath(path);
      if (isWithin(rootReal, resolved)) return resolved;
    } catch {
      // 这一层没有，继续看下一层。
    }
  }
  return null;
}

/**
 * 读取一次运行的报告正文。轨迹与诊断的文件名不同，两个都认。
 *
 * 目录在根内**不等于**里面的文件也在根内：`<root>/x/report.html` 可以是一条指向别处的
 * 符号链接。因此这里对**文件本身**再 realpath 一次并比对前缀，而不是信任目录那一层的结论。
 */
export async function readEvalReportHtml(runId: string): Promise<string | null> {
  const root = evalReportsDir();
  if (!root) return null;
  const dir = await resolveRunDir(runId);
  if (!dir) return null;
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return null;
  }
  for (const name of [REPORT_FILE, INSPECTION_FILE]) {
    try {
      const fileReal = await realpath(join(dir, name));
      if (!isWithin(rootReal, fileReal)) continue;
      return await readFile(fileReal, "utf8");
    } catch {
      // 换另一个名字再试。
    }
  }
  return null;
}
