import { FactoryApiError } from "./api.ts";

export const FACTORY_POLL_INTERVAL_MS = 1_500;

/** Returns null for permanent failures; transient failures back off without ending the task UI. */
export function factoryPollRetryDelay(error: unknown, consecutiveFailures: number): number | null {
  if (!(error instanceof FactoryApiError) || !error.retryable) return null;
  const failureIndex = Math.max(0, consecutiveFailures - 1);
  const backoff = Math.min(FACTORY_POLL_INTERVAL_MS * (2 ** Math.min(failureIndex, 3)), 12_000);
  return Math.max(backoff, Math.min(error.retryAfterMs ?? 0, 60_000));
}

export function factoryPollRecoveryMessage(consecutiveFailures: number): string {
  return `状态同步暂时失败，正在第 ${consecutiveFailures} 次重试。`;
}
