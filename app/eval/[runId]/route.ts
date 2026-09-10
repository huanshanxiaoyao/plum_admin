import { getCurrentIdentity } from "@/lib/auth/session";
import { evalReportsEnabled } from "@/lib/eval-reports/config";
import { readEvalReportHtml } from "@/lib/eval-reports/store";

/**
 * 报告正文。**Route Handler 不经过 `(admin)/layout.tsx`**，因此登录与角色判定必须在这里
 * 自己做一遍，不能依赖分组布局。
 */

// 报告在不透明源里运行：脚本能跑（时间轴滑块需要），但拿不到后台的 Cookie 与同源接口。
// 这是把自己生成的 HTML 挂到 admin 域上的代价——report.py 里任何一个转义疏漏，
// 没有这道沙箱就是 admin.plum.top 上的存储型 XSS。
// nginx 在 server 级还会补一份站点 CSP，两份策略各自生效、取交集，比单独一份更严，不冲突。
const REPORT_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
].join("; ");

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  if (!evalReportsEnabled()) return new Response("Not Found", { status: 404 });
  const identity = await getCurrentIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  if (identity.role !== "admin") return new Response("Forbidden", { status: 403 });

  const { runId } = await context.params;
  const html = await readEvalReportHtml(runId);
  // 不安全的 run id、不存在的目录、逃出根目录的符号链接，对调用方是同一个结果：没有这份报告。
  if (html === null) return new Response("Not Found", { status: 404 });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": REPORT_CSP,
      // 报告含正文，不进任何缓存。
      "Cache-Control": "no-store",
    },
  });
}
