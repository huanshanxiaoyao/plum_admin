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

/**
 * 诊断报告的保留天数。
 *
 * 与后端 `PLUM_DEBUG_CONSOLE_RETENTION_DAYS` 同口径、同默认值（7 天）：诊断报告的正文和
 * Debug Console 捕获的 Prompt 正文是同一类东西——别人的对话——没有理由在这里留得更久。
 * 至少 1 天，写 0 或负数不代表「立刻删」，只代表配错了。
 */
export function evalInspectRetentionDays(): number {
  const raw = Number.parseInt(process.env.ADMIN_EVAL_INSPECT_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : 7;
}

/**
 * 一份诊断报告的清除时刻，解析不出生成时间时返回 null。
 *
 * 页面上的「还剩几天」与清理任务的删除判定都调它，两边因此不可能算出不同的答案——
 * 各写一份的话，页面说还剩两天而文件昨天就没了是迟早的事。
 */
export function inspectExpiresAt(generatedAt: string, now = new Date()): Date | null {
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) return null;
  void now;
  return new Date(generated.getTime() + evalInspectRetentionDays() * 86_400_000);
}

/** 距离清除还有几天，向上取整；已过期返回 0。 */
export function daysUntilExpiry(generatedAt: string, now = new Date()): number | null {
  const expires = inspectExpiresAt(generatedAt, now);
  if (!expires) return null;
  return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86_400_000));
}
