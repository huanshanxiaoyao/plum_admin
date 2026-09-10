import type { FactoryRunSnapshot } from "./contracts.ts";
import { isRunPollingTerminal } from "./contracts.ts";

export type SingleRunResolution =
  | { readonly type: "poll" }
  | { readonly type: "load_draft"; readonly candidateId: string }
  | { readonly type: "failed"; readonly message: string };

export function resolveSingleRun(snapshot: FactoryRunSnapshot): SingleRunResolution {
  if (!isRunPollingTerminal(snapshot.run.status)) return { type: "poll" };

  const candidate = snapshot.candidates.find(
    (item) => item.decision === "selected" && item.work_id,
  ) ?? snapshot.candidates.find((item) => item.work_id);
  if (candidate) return { type: "load_draft", candidateId: candidate.id };

  return {
    type: "failed",
    message: snapshot.run.status === "partial_failed"
      ? "生成部分失败，后端未返回可编辑草稿。"
      : "生成已结束，但后端未返回角色草稿。",
  };
}
