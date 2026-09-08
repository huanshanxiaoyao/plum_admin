#!/usr/bin/env node --experimental-transform-types
/**
 * 清除过期的只读诊断报告。
 *
 * 诊断报告的正文是**别人的对话**，因此它在这台主机上的存在是有期限的。本脚本按
 * `ADMIN_EVAL_INSPECT_RETENTION_DAYS`（默认 7 天，与后端 Debug Console 同口径）删除
 * `${ADMIN_EVAL_REPORTS_DIR}/_inspect/` 下已过期的运行。
 *
 * **刻意复用应用自己的 `lib/eval-reports`**，而不是另写一段 `find -mtime`：
 *
 * - 判定依据是 manifest 里的 `generated_at`，不是文件 mtime——mtime 会被任何一次搬运、
 *   备份或恢复改掉，那会让报告悄悄延寿；
 * - 页面上的「N 天后清除」与这里的删除判定调的是同一个函数，两边因此不可能算出不同答案。
 *
 * 只删 `_inspect/` 下的目录。轨迹评测的产物是合成对话，长期留存，本脚本碰都不碰。
 *
 * 用法（systemd timer 每天跑一次，见 deploy/systemd/）：
 *   node --experimental-transform-types deploy/eval-inspect-sweep.mjs [--dry-run]
 */

import { rm } from "node:fs/promises";
import process from "node:process";
import { daysUntilExpiry, evalInspectRetentionDays, evalReportsDir } from "../lib/eval-reports/config.ts";
import { listEvalReports, resolveRunDir } from "../lib/eval-reports/store.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const root = evalReportsDir();
  if (!root) {
    console.log("ADMIN_EVAL_REPORTS_DIR 未配置，无事可做");
    return 0;
  }
  const retention = evalInspectRetentionDays();
  const { reports } = await listEvalReports();
  const inspections = reports.filter((report) => report.area === "inspect");

  let removed = 0;
  let kept = 0;
  for (const report of inspections) {
    const remaining = daysUntilExpiry(report.generatedAt);
    // 生成时间解析不出来的报告**不删**：宁可留着让人来看一眼，也不要因为一个坏字段
    // 就静默删掉别人的诊断记录。它在列表页上同样会露出来。
    if (remaining === null) {
      console.warn(`跳过 ${report.runId}：generated_at 解析不出来（${report.generatedAt}）`);
      kept += 1;
      continue;
    }
    if (remaining > 0) {
      kept += 1;
      continue;
    }
    const dir = await resolveRunDir(report.runId, "inspect");
    if (!dir) {
      console.warn(`跳过 ${report.runId}：目录已不在`);
      continue;
    }
    if (dryRun) {
      console.log(`would remove ${dir}  (生成于 ${report.generatedAt})`);
    } else {
      await rm(dir, { recursive: true, force: true });
      console.log(`removed ${dir}  (生成于 ${report.generatedAt})`);
    }
    removed += 1;
  }
  console.log(
    `诊断报告 ${inspections.length} 份，保留期 ${retention} 天：` +
      `${dryRun ? "待清除" : "已清除"} ${removed}，保留 ${kept}`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
