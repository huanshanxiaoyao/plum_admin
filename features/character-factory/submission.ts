import type { FactoryCandidate, FactoryRunSnapshot } from "./contracts.ts";

export function isAcceptedSubmission(candidate: FactoryCandidate): boolean {
  return candidate.submission?.status === "published" || candidate.submission?.status === "pending_review";
}

export function preflightIssueMessages(candidate: FactoryCandidate): readonly string[] {
  if (!candidate.preflight) return ["服务端未返回预检结果"];
  if (candidate.preflight.ready) return [];
  return candidate.preflight.issues.length
    ? candidate.preflight.issues.map((issue) => issue.message)
    : ["投稿预检未通过"];
}

export function preflightReadyIds(
  snapshot: FactoryRunSnapshot,
  requestedIds: readonly string[],
): readonly string[] {
  const requested = new Set(requestedIds);
  return snapshot.candidates
    .filter((candidate) => requested.has(candidate.id) && candidate.preflight?.ready === true)
    .map((candidate) => candidate.id);
}

export function submissionFailureMessage(candidate: FactoryCandidate): string | null {
  const submission = candidate.submission;
  if (!submission || isAcceptedSubmission(candidate)) return null;
  return submission.error_message || submission.error_code || (submission.status === "rejected" ? "投稿被拒绝" : "投稿失败");
}
