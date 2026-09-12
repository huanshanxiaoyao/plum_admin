import type { FactoryTaskStatus, ImageRunStatus } from "./contracts.ts";

const POLLING_STATUSES = new Set<ImageRunStatus>(["prompting", "generating"]);

export function imageWorkflowStep(status: ImageRunStatus | "empty"): number {
  if (status === "empty" || status === "input" || status === "prompting" || status === "failed") return 0;
  if (status === "prompt_ready") return 1;
  if (status === "generating" || status === "candidates_ready") return 2;
  if (status === "editing") return 3;
  return 4;
}

export function shouldPollImageRun(
  status: ImageRunStatus,
  taskStatuses: readonly FactoryTaskStatus[] = [],
): boolean {
  return POLLING_STATUSES.has(status)
    || taskStatuses.some((taskStatus) => taskStatus === "queued" || taskStatus === "running");
}

export function imageRunInputReady(description: string, imageCount: number, ownerId: string): boolean {
  return Boolean(ownerId.trim()) && (Boolean(description.trim()) || imageCount > 0);
}
