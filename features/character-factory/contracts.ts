export const CONTENT_MODES = ["limited", "limitless"] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];

export const RUN_STATUSES = [
  "not_started",
  "parsing",
  "generating",
  "draft",
  "partial_failed",
  "submitted",
] as const;
export type FactoryRunStatus = (typeof RUN_STATUSES)[number];

export type FactoryRunKind = "single" | "batch";
export type FactorySourceType = "url_text" | "text" | "image_text" | "mixed";

export type UrlTextSource = {
  readonly type: "url_text";
  readonly urls: readonly string[];
  readonly description: string;
};

export type TextSource = {
  readonly type: "text";
  readonly description: string;
};

export type ImageTextSource = {
  readonly type: "image_text";
  readonly source_media_ids: readonly string[];
  readonly description: string;
};

/** Single-character input: any combination is valid as long as one material is present. */
export type MixedSource = {
  readonly type: "mixed";
  readonly urls: readonly string[];
  readonly source_media_ids: readonly string[];
  readonly description: string;
};

export type FactorySource = UrlTextSource | TextSource | ImageTextSource | MixedSource;

export type FactoryRun = {
  readonly id: string;
  readonly kind: FactoryRunKind;
  readonly status: FactoryRunStatus;
  readonly content_mode: ContentMode;
  readonly source: FactorySource;
  readonly creative_intent: string;
  readonly language: string;
  readonly market: string;
  readonly owner_platform_user_id: string;
  readonly target_count: number;
  readonly submission_batch_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CandidateDecision = "proposed" | "selected" | "rejected";
export type SubmissionStatus = "published" | "pending_review" | "rejected" | "failed";
export type FactoryCandidateStatus = "planned" | "selected" | "rejected" | "generating" | "draft" | "failed" | "submitted";

export type SourceEvidence = {
  readonly label: string;
  readonly source_url: string | null;
  readonly excerpt: string | null;
};

export type CandidateSubmission = {
  readonly status: SubmissionStatus;
  readonly character_id: string | null;
  readonly work_id: string | null;
  readonly draft_revision: number | null;
  readonly version_number: number | null;
  readonly review_id: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly submitted_at: string | null;
};

export type CandidatePreflightIssue = {
  readonly code: string;
  readonly message: string;
};

export type CandidatePromptBudgetBlock = {
  readonly block: string;
  readonly limit: number;
  readonly over_limit: boolean;
  readonly required: boolean;
  readonly tokens: number;
};

export type CandidatePromptBudget = {
  readonly blocks: readonly CandidatePromptBudgetBlock[];
  readonly over_limit: boolean;
  readonly total_tokens: number;
};

export type CandidatePreflight = {
  readonly candidate_id: string;
  readonly ready: boolean;
  readonly issues: readonly CandidatePreflightIssue[];
  readonly work_id: string | null;
  readonly draft_revision: number | null;
  readonly prompt_budget: CandidatePromptBudget | null;
};

export type FactoryCandidate = {
  readonly id: string;
  readonly run_id: string;
  /** Candidate lifecycle reported by the Character Factory backend. */
  readonly status?: FactoryCandidateStatus;
  readonly decision: CandidateDecision;
  readonly title: string;
  readonly description: string;
  readonly reference_image_urls: readonly string[];
  readonly evidence: readonly SourceEvidence[];
  readonly work_id: string | null;
  readonly draft_revision: number | null;
  readonly preflight: CandidatePreflight | null;
  readonly submission: CandidateSubmission | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export const FACTORY_TASK_TYPES = [
  "source_parse",
  "image_understand",
  "candidate_plan",
  "text_generate",
  "image_generate",
  "assemble_draft",
  "revise_text",
  "revise_image",
] as const;
export type FactoryTaskType = (typeof FACTORY_TASK_TYPES)[number];

export type FactoryTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type FactoryTaskError = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
};

export type FactoryTask = {
  readonly id: string;
  /** Stable across automatic attempts and manual retry cycles. */
  readonly task_key: string;
  readonly run_id: string;
  readonly candidate_id: string | null;
  readonly type: FactoryTaskType;
  readonly status: FactoryTaskStatus;
  readonly cycle: number;
  readonly attempt: number;
  /** Only the current attempt contributes to the aggregate Run status. */
  readonly is_current: boolean;
  readonly timeout_seconds: number;
  readonly provider: string | null;
  readonly model: string | null;
  readonly prompt_version: string | null;
  readonly policy_version: string | null;
  readonly error: FactoryTaskError | null;
  /** Provider result. Revision previews are validated before entering the UI. */
  readonly output: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CropRect = {
  readonly contract_version: 2;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CharacterGender = "" | "male" | "female" | "non_binary";
export type CharacterRating = "general" | "mature";
export type CharacterVisibility = "public" | "private";

export type CharacterDraft = {
  readonly candidate_id: string;
  readonly work_id: string;
  readonly revision: number;
  readonly display_name: string;
  readonly gender: CharacterGender;
  readonly intro: string;
  readonly opening_scene: string;
  readonly character_settings: string;
  readonly example_dialogues: string;
  readonly response_rules: string;
  readonly tag_ids: readonly string[];
  readonly creator_declared_rating: CharacterRating;
  readonly visibility: CharacterVisibility;
  readonly owner_platform_user_id: string;
  readonly portrait_media_id: string;
  readonly image_set_id: string;
  readonly portrait_crop: CropRect | null;
  readonly avatar_crop: CropRect | null;
  readonly portrait_position_x: number;
  readonly portrait_position_y: number;
  readonly portrait_zoom: number;
  readonly avatar_position_x: number;
  readonly avatar_position_y: number;
  readonly avatar_zoom: number;
  readonly adult_confirmed: boolean;
  readonly rights_confirmed: boolean;
  readonly updated_at: string;
};

export type CharacterDraftContent = Omit<
  CharacterDraft,
  "candidate_id" | "work_id" | "revision" | "owner_platform_user_id" | "updated_at"
>;

export type RunProgress = {
  readonly total: number;
  readonly selected: number;
  readonly running: number;
  readonly failed: number;
  readonly drafts: number;
  readonly submitted: number;
};

export type FactoryRunSnapshot = {
  readonly run: FactoryRun;
  readonly candidates: readonly FactoryCandidate[];
  readonly tasks: readonly FactoryTask[];
  readonly progress: RunProgress;
};

export type ApiMeta = {
  readonly request_id: string;
};

export type ApiResponse<T> = {
  readonly data: T;
  readonly meta: ApiMeta;
};

export type CreateRunRequest = {
  readonly kind: FactoryRunKind;
  readonly content_mode?: ContentMode;
  readonly source: FactorySource;
  readonly creative_intent: string;
  readonly language: string;
  readonly market: string;
  readonly owner_platform_user_id: string;
  readonly target_count: number;
};

export type CreateRunResult = {
  readonly run_id: string;
  readonly status: "not_started";
};

export type CandidatePatch = {
  readonly decision?: CandidateDecision;
  readonly title?: string;
  readonly description?: string;
  readonly reference_image_urls?: readonly string[];
};

export type DraftPatch = Partial<
  CharacterDraftContent
>;

export type AgentRevisionRequest = {
  readonly kind: "text" | "image";
  readonly instruction: string;
  readonly expected_revision: number;
  readonly fields?: readonly AgentRevisionTextField[];
};

export const AGENT_REVISION_TEXT_FIELDS = [
  "display_name",
  "intro",
  "opening_scene",
  "character_settings",
  "example_dialogues",
  "response_rules",
] as const;
export type AgentRevisionTextField = (typeof AGENT_REVISION_TEXT_FIELDS)[number];

export type AgentRevisionChange = {
  readonly field: AgentRevisionTextField;
  readonly before: string;
  readonly after: string;
};

export type AgentRevisionTextPreview = {
  readonly expected_revision: number;
  readonly changes: readonly AgentRevisionChange[];
};

export type AgentRevisionImageState = Pick<
  CharacterDraftContent,
  | "portrait_media_id"
  | "image_set_id"
  | "portrait_crop"
  | "avatar_crop"
  | "portrait_position_x"
  | "portrait_position_y"
  | "portrait_zoom"
  | "avatar_position_x"
  | "avatar_position_y"
  | "avatar_zoom"
>;

export type AgentRevisionImagePreview = {
  readonly expected_revision: number;
  readonly image_change: {
    readonly before: AgentRevisionImageState;
    readonly after: AgentRevisionImageState;
  };
};

export type AgentRevisionPreview = AgentRevisionTextPreview | AgentRevisionImagePreview;

export type PreviewMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

export type PreviewTurnRequest = {
  readonly expected_revision: number;
  readonly message: string;
  readonly history: readonly PreviewMessage[];
};

export type PreviewTurnResult = {
  readonly candidate_id: string;
  readonly work_id: string;
  readonly draft_revision: number;
  readonly reply: string;
  readonly display_content: string;
  readonly provider_id: string;
  readonly model: string;
  readonly estimated_input_tokens: number;
};

export type SubmissionConfirmation = {
  readonly reason: string;
  readonly adult_confirmed: true;
  readonly rights_confirmed: true;
  readonly candidate_ids: readonly string[];
};

const PARSING_TASKS = new Set<FactoryTaskType>([
  "source_parse",
  "image_understand",
  "candidate_plan",
]);

export function isFactoryTaskTerminal(status: FactoryTaskStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** Polling is needed only while the worker can change the Run without another user action. */
export function isRunPollingTerminal(status: FactoryRunStatus): boolean {
  return status !== "parsing" && status !== "generating";
}

export function summarizeRun(
  candidates: readonly FactoryCandidate[],
  tasks: readonly FactoryTask[],
): RunProgress {
  const selected = candidates.filter((candidate) => candidate.decision === "selected");
  const currentTasks = tasks.filter((task) => task.is_current);
  const failedSubjects = new Set(
    currentTasks
      .filter((task) => task.status === "failed")
      .map((task) => task.candidate_id ?? `task:${task.task_key}`),
  );
  for (const candidate of selected) {
    if (candidate.status === "failed" || candidate.submission?.status === "failed" || candidate.submission?.status === "rejected") {
      failedSubjects.add(candidate.id);
    }
  }
  return {
    total: candidates.length,
    selected: selected.length,
    running: currentTasks.filter((task) => task.status === "queued" || task.status === "running").length,
    failed: failedSubjects.size,
    drafts: selected.filter((candidate) =>
      candidate.status === "draft" || candidate.status === "submitted" ||
      (candidate.work_id !== null && candidate.draft_revision !== null),
    ).length,
    submitted: selected.filter(
      (candidate) =>
        candidate.status === "submitted" ||
        candidate.submission?.status === "published" || candidate.submission?.status === "pending_review",
    ).length,
  };
}

/** Mirrors the server aggregation order in the technical design. */
export function deriveRunStatus(
  candidates: readonly FactoryCandidate[],
  tasks: readonly FactoryTask[],
): FactoryRunStatus {
  const currentTasks = tasks.filter((task) => task.is_current);
  const active = currentTasks.filter((task) => task.status === "queued" || task.status === "running");
  if (active.some((task) => PARSING_TASKS.has(task.type))) return "parsing";
  if (active.length > 0) return "generating";

  const progress = summarizeRun(candidates, tasks);
  if (progress.failed > 0) return "partial_failed";
  if (progress.selected > 0 && progress.submitted === progress.selected) return "submitted";
  if (progress.selected > 0 && progress.drafts === progress.selected) return "draft";
  return "not_started";
}
