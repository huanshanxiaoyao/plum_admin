/**
 * 评测报告目录的运行时开关。
 *
 * 不配置 = 整个 `/eval` 入口不存在，plum_admin 的行为与未引入本功能时一致。这是刻意的：
 * 评测不是后台的业务模块，只是借这里的域名与登录托管产物，因此必须能一键退回。
 */
export function evalReportsDir(): string | null {
  const configured = process.env.ADMIN_EVAL_REPORTS_DIR?.trim();
  return configured ? configured : null;
}

export function evalReportsEnabled(): boolean {
  return evalReportsDir() !== null;
}
