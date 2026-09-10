import type { components as AdminApiComponents } from "../../contracts/generated/admin-api.ts";
import type {
  ApiResponse,
  CandidatePreflight,
  CandidatePromptBudget,
  CandidateSubmission,
  FactoryCandidate,
  FactoryRunSnapshot,
  FactorySource,
  FactoryTask,
  SourceEvidence,
} from "./contracts.ts";

type BackendSchemas = AdminApiComponents["schemas"];
export type BackendFactoryRunResponse = BackendSchemas["AdminCharacterFactoryRunResponse"];
export type BackendFactoryCreateRunRequest = BackendSchemas["AdminCharacterFactoryCreateRunRequest"];
export type BackendFactoryCandidateUpdateRequest = BackendSchemas["AdminCharacterFactoryCandidateUpdateRequest"];
type BackendRun = BackendSchemas["AdminCharacterFactoryRun"];
type BackendCandidate = BackendSchemas["AdminCharacterFactoryCandidate"];
type BackendTask = BackendSchemas["AdminCharacterFactoryTask"];
export type BackendFactoryTaskResponse = {
  readonly data: BackendTask;
  readonly meta: { readonly request_id: string };
};

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceList(value: unknown): SourceEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [{ label: item, source_url: null, excerpt: null }];
    }
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    return [{
      label: stringValue(entry.label, "来源依据"),
      source_url: typeof entry.source_url === "string" ? entry.source_url : null,
      excerpt: typeof entry.excerpt === "string" ? entry.excerpt : null,
    }];
  });
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function promptBudgetFrom(value: unknown): CandidatePromptBudget | null {
  if (!value || typeof value !== "object") return null;
  const budget = value as Record<string, unknown>;
  if (!Array.isArray(budget.blocks)) return null;
  const blocks = budget.blocks.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const block = item as Record<string, unknown>;
    if (
      typeof block.block !== "string" ||
      typeof block.limit !== "number" ||
      typeof block.over_limit !== "boolean" ||
      typeof block.required !== "boolean" ||
      typeof block.tokens !== "number"
    ) return [];
    return [{
      block: block.block,
      limit: block.limit,
      over_limit: block.over_limit,
      required: block.required,
      tokens: block.tokens,
    }];
  });
  return typeof budget.over_limit === "boolean" && typeof budget.total_tokens === "number"
    ? { blocks, over_limit: budget.over_limit, total_tokens: budget.total_tokens }
    : null;
}

function preflightFrom(value: unknown): CandidatePreflight | null {
  if (!value || typeof value !== "object") return null;
  const preflight = value as Record<string, unknown>;
  if (typeof preflight.candidate_id !== "string" || typeof preflight.ready !== "boolean") return null;
  const issues = Array.isArray(preflight.issues)
    ? preflight.issues.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const issue = item as Record<string, unknown>;
      return typeof issue.code === "string" && typeof issue.message === "string"
        ? [{ code: issue.code, message: issue.message }]
        : [];
    })
    : [];
  return {
    candidate_id: preflight.candidate_id,
    ready: preflight.ready,
    issues,
    work_id: nullableString(preflight.work_id),
    draft_revision: nullablePositiveInteger(preflight.draft_revision),
    prompt_budget: promptBudgetFrom(preflight.prompt_budget),
  };
}

function submissionFrom(value: unknown): CandidateSubmission | null {
  if (!value || typeof value !== "object") return null;
  const submission = value as Record<string, unknown>;
  if (!(["published", "pending_review", "rejected", "failed"] as const).includes(
    submission.status as "published" | "pending_review" | "rejected" | "failed",
  )) return null;
  return {
    status: submission.status as CandidateSubmission["status"],
    character_id: nullableString(submission.character_id),
    work_id: nullableString(submission.work_id),
    draft_revision: nullablePositiveInteger(submission.draft_revision),
    version_number: nullablePositiveInteger(submission.version_number),
    review_id: nullableString(submission.review_id),
    error_code: nullableString(submission.error_code),
    error_message: nullableString(submission.error_message),
    submitted_at: nullableString(submission.submitted_at),
  };
}

function sourceFrom(run: BackendRun): FactorySource {
  const payload = run.source_payload;
  const description = stringValue(payload.description);
  if (run.source_type === "url_text") {
    return { type: "url_text", urls: stringArray(payload.urls), description };
  }
  if (run.source_type === "image_text") {
    return { type: "image_text", source_media_ids: stringArray(payload.source_media_ids), description };
  }
  if (run.source_type === "mixed") {
    return {
      type: "mixed",
      urls: stringArray(payload.urls),
      source_media_ids: stringArray(payload.source_media_ids),
      description,
    };
  }
  return { type: "text", description };
}

function candidateFrom(candidate: BackendCandidate): FactoryCandidate {
  const extended = candidate as BackendCandidate & Record<string, unknown>;
  const direction = candidate.direction;
  return {
    id: candidate.id,
    run_id: candidate.run_id,
    status: candidate.status,
    decision: candidate.selected ? "selected" : candidate.status === "rejected" ? "rejected" : "proposed",
    title: stringValue(direction.title, `候选 ${candidate.ordinal}`),
    description: stringValue(direction.description),
    reference_image_urls: stringArray(direction.reference_image_urls),
    evidence: evidenceList(direction.evidence),
    work_id: candidate.work_id ?? null,
    draft_revision: nullablePositiveInteger(extended.draft_revision),
    preflight: preflightFrom(extended.preflight),
    submission: submissionFrom(extended.submission),
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}

function taskKey(task: BackendTask): string {
  return `${task.task_type}:${task.candidate_id ?? "run"}`;
}

function taskFrom(task: BackendTask, isCurrent: boolean): FactoryTask {
  const context = task.input.generation_context;
  const generation = context && typeof context === "object"
    ? context as Record<string, unknown>
    : {};
  return {
    id: task.id,
    task_key: taskKey(task),
    run_id: task.run_id,
    candidate_id: task.candidate_id ?? null,
    type: task.task_type,
    status: task.status === "pending" ? "queued" : task.status,
    cycle: task.cycle,
    attempt: task.attempt,
    is_current: isCurrent,
    timeout_seconds: task.timeout_seconds,
    provider: task.provider ?? null,
    model: task.model ?? null,
    prompt_version: typeof generation.prompt_version === "string" ? generation.prompt_version : null,
    policy_version: typeof generation.policy_version === "string" ? generation.policy_version : null,
    error: task.error_code
      ? { code: task.error_code, message: task.error_code, retryable: false }
      : null,
    output: task.output,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
}

export function adaptFactoryTaskResponse(
  response: BackendFactoryTaskResponse,
): ApiResponse<FactoryTask> {
  return {
    data: taskFrom(response.data, true),
    meta: response.meta,
  };
}

export function adaptFactoryRunResponse(
  response: BackendFactoryRunResponse,
): ApiResponse<FactoryRunSnapshot> {
  const data = response.data;
  const latestTasks = new Map<string, BackendTask>();
  for (const task of data.tasks) {
    const key = taskKey(task);
    const current = latestTasks.get(key);
    if (!current || task.cycle > current.cycle ||
      (task.cycle === current.cycle && task.attempt > current.attempt) ||
      (task.cycle === current.cycle && task.attempt === current.attempt && task.updated_at > current.updated_at)) {
      latestTasks.set(key, task);
    }
  }
  return {
    data: {
      run: {
        id: data.id,
        kind: data.kind,
        status: data.status,
        content_mode: data.content_mode,
        source: sourceFrom(data),
        creative_intent: data.creative_intent,
        language: data.language,
        market: data.market,
        owner_platform_user_id: data.owner_platform_user_id,
        target_count: data.target_count,
        submission_batch_id: null,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
      candidates: data.candidates.map(candidateFrom),
      tasks: data.tasks.map((task) => taskFrom(task, latestTasks.get(taskKey(task))?.id === task.id)),
      progress: {
        total: data.progress.candidate_total,
        selected: data.progress.candidate_selected,
        running: data.progress.task_pending + data.progress.task_running,
        failed: Math.max(data.progress.candidate_failed, data.progress.task_failed),
        drafts: data.progress.candidate_draft,
        submitted: data.progress.candidate_submitted,
      },
    },
    meta: { request_id: response.meta.request_id },
  };
}
