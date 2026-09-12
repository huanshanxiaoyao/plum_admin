import { adminApiWritesEnabled, adminDataSourceMode } from "@/lib/bff/config";
import { CandidateWorkbench } from "./candidate-workbench";
import { MultiConsole } from "./multi-console";
import { SingleConsole } from "./single-console";
import { ImageWorkflowConsole } from "./image-workflow-console";

function runtime() {
  const fixtureMode = adminDataSourceMode() === "fixture";
  const canWrite = fixtureMode || adminApiWritesEnabled();
  return {
    fixtureMode,
    canWrite,
    blockedReason: canWrite
      ? ""
      : "Admin API 写入未启用，当前只能查看已有任务。",
  };
}

export function SingleFactoryPage() {
  return <SingleConsole {...runtime()} />;
}

export function MultiFactoryPage() {
  return <MultiConsole {...runtime()} />;
}

export function ImageWorkflowPage() {
  return <ImageWorkflowConsole {...runtime()} />;
}

export async function CandidateWorkbenchPage({
  params,
}: {
  params: Promise<{ runId: string; candidateId: string }>;
}) {
  const { runId, candidateId } = await params;
  return <CandidateWorkbench key={`${runId}:${candidateId}`} {...runtime()} runId={runId} candidateId={candidateId} />;
}
