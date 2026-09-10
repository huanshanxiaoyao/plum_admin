import { notFound, redirect } from "next/navigation";
import { EvalReportList } from "@/features/eval-reports/report-list";
import { requireIdentity } from "@/lib/auth/require-identity";
import { evalReportsEnabled } from "@/lib/eval-reports/config";
import { listEvalReports } from "@/lib/eval-reports/store";

/**
 * 记忆评测报告是工程内部工具，不是后台的运营能力，因此**不在 `(admin)` 分组里**：
 * 它不套 AdminShell、不进主导航，只复用同一份登录。入口在后台侧栏底部。
 */

export const dynamic = "force-dynamic";

export default async function EvalReportsPage() {
  // 开关未配置时这个入口不存在，而不是「存在但为空」——后者会让人以为发布坏了。
  if (!evalReportsEnabled()) notFound();
  // 复用后台的身份闸：它会带上返回路径，登录后能回到这里。capability 参数不适用——
  // 评测限制的是角色，而 Capability 由后端 OpenAPI 生成，为它新开一个等于改产品契约。
  const identity = await requireIdentity("/eval");
  if (identity.role !== "admin") redirect("/forbidden");

  return <EvalReportList listing={await listEvalReports()} />;
}
