import type { FactoryRunSnapshot } from "./contracts.ts";
import { isRunPollingTerminal } from "./contracts.ts";
import type { BatchStage } from "./factory-session.tsx";

export function nextBatchStage(current: BatchStage, snapshot: FactoryRunSnapshot): BatchStage {
  if (snapshot.run.status === "submitted") return "submitted";
  if (snapshot.run.status === "parsing") return "discovering";

  const currentTasks = snapshot.tasks.filter((task) => task.is_current);
  const planFinished = currentTasks.some(
    (task) => task.type === "candidate_plan" && task.status === "succeeded",
  );
  const generationStarted = currentTasks.some(
    (task) => task.type === "text_generate" || task.type === "image_generate",
  );
  // Selected candidates make the API report generating before generation tasks exist.
  if (planFinished && !generationStarted) return "pool";
  if (snapshot.run.status === "generating") return "generating";
  if (current === "discovering" && snapshot.run.status === "partial_failed") return "discovery_failed";
  if (current === "generating" && isRunPollingTerminal(snapshot.run.status)) return "review";
  return current;
}
