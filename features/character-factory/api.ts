import type {
  AgentRevisionRequest,
  ApiResponse,
  CandidatePatch,
  CharacterDraft,
  CharacterDraftContent,
  CreateRunRequest,
  FactoryCandidate,
  FactoryRunSnapshot,
  FactoryTask,
  PreviewTurnRequest,
  PreviewTurnResult,
  SubmissionConfirmation,
} from "./contracts.ts";
import {
  adaptFactoryTaskResponse,
  adaptFactoryRunResponse,
  type BackendFactoryCandidateUpdateRequest,
  type BackendFactoryCreateRunRequest,
  type BackendFactoryRunResponse,
  type BackendFactoryTaskResponse,
} from "./wire.ts";

const BASE = "/api/admin/character-factory";

export function characterFactoryRevisionImageUrl(
  candidateId: string,
  taskId: string,
  side: "before" | "after",
): string {
  return `${BASE}/candidates/${encodeURIComponent(candidateId)}/agent-revisions/${encodeURIComponent(taskId)}/preview-image/${side}`;
}

export function characterFactoryDraftPortraitUrl(
  candidateId: string,
  revision: number,
): string {
  return `${BASE}/candidates/${encodeURIComponent(candidateId)}/draft/portrait?revision=${encodeURIComponent(String(revision))}`;
}

export class FactoryApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "FactoryApiError";
  }
}

type RequestOptions = {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
  readonly expectedRevision?: number;
};

type ErrorBody = {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly request_id?: unknown;
    readonly retryable?: unknown;
  };
};

type BackendCharacterDraft = {
  readonly candidate_id: string;
  readonly work_id: string;
  readonly revision: number;
  readonly owner_platform_user_id: string;
  readonly content: CharacterDraftContent;
  readonly updated_at: string;
};

type BackendCharacterDraftResponse = ApiResponse<BackendCharacterDraft>;

function adaptCharacterDraft(response: BackendCharacterDraftResponse): ApiResponse<CharacterDraft> {
  const { content, ...metadata } = response.data;
  return { ...response, data: { ...metadata, ...content } };
}

function draftContent(draft: CharacterDraft): CharacterDraftContent {
  const {
    candidate_id: _candidateId,
    work_id: _workId,
    revision: _revision,
    owner_platform_user_id: _ownerPlatformUserId,
    updated_at: _updatedAt,
    ...content
  } = draft;
  return content;
}

function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

function responseRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.expectedRevision !== undefined) headers.set("If-Match", `"${options.expectedRevision}"`);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers, signal: options.signal });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new FactoryApiError(0, "request_aborted", "请求已取消。", undefined, true);
    }
    throw new FactoryApiError(0, "network_error", "请求未发送或未返回。", undefined, true);
  }

  const retryDelay = retryAfterMs(response.headers.get("retry-after"));
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new FactoryApiError(
      response.status,
      "unexpected_response",
      "服务端返回了无法识别的响应。",
      response.headers.get("x-request-id") ?? undefined,
      responseRetryable(response.status),
      retryDelay,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FactoryApiError(
      response.status,
      "unexpected_response",
      "服务端返回了无法识别的响应。",
      response.headers.get("x-request-id") ?? undefined,
      responseRetryable(response.status),
      retryDelay,
    );
  }
  if (!response.ok) {
    const error = body && typeof body === "object" ? (body as ErrorBody).error : undefined;
    throw new FactoryApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "request_failed",
      typeof error?.message === "string" ? error.message : "请求失败，请稍后重试。",
      typeof error?.request_id === "string" ? error.request_id : response.headers.get("x-request-id") ?? undefined,
      typeof error?.retryable === "boolean" ? error.retryable : responseRetryable(response.status),
      retryDelay,
    );
  }
  return body as T;
}

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

function clarifyMissingEndpoint<T>(promise: Promise<T>, feature: string): Promise<T> {
  return promise.catch((caught) => {
    if (caught instanceof FactoryApiError && caught.status === 404) {
      throw new FactoryApiError(
        404,
        "endpoint_unavailable",
        `${feature}后端端点尚未接入。`,
        caught.requestId,
        false,
      );
    }
    throw caught;
  });
}

export function createRun(
  body: CreateRunRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  const { source, ...run } = body;
  const { type: sourceType, ...sourcePayload } = source;
  const payload: BackendFactoryCreateRunRequest = {
    ...run,
    content_mode: body.content_mode ?? "limited",
    source_type: sourceType,
    source_payload: {
      description: sourcePayload.description,
      ...("urls" in sourcePayload ? { urls: [...sourcePayload.urls] } : {}),
      ...("source_media_ids" in sourcePayload
        ? { source_media_ids: [...sourcePayload.source_media_ids] }
        : {}),
    },
  };
  return request<BackendFactoryRunResponse>(
    "/runs",
    json("POST", payload),
    { idempotencyKey, signal },
  ).then(adaptFactoryRunResponse);
}

export function startRun(
  runId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  return request<BackendFactoryRunResponse>(`/runs/${encodeURIComponent(runId)}/start`, json("POST", {}), {
    idempotencyKey,
    signal,
  }).then(adaptFactoryRunResponse);
}

export function getRun(runId: string, signal?: AbortSignal): Promise<ApiResponse<FactoryRunSnapshot>> {
  return request<BackendFactoryRunResponse>(`/runs/${encodeURIComponent(runId)}`, { method: "GET" }, { signal })
    .then(adaptFactoryRunResponse);
}

export function updateCandidate(
  runId: string,
  candidateId: string,
  patch: CandidatePatch,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  const direction = patch.title !== undefined || patch.description !== undefined || patch.reference_image_urls !== undefined
    ? {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.reference_image_urls !== undefined ? { reference_image_urls: [...patch.reference_image_urls] } : {}),
      }
    : undefined;
  const payload: BackendFactoryCandidateUpdateRequest = {
    ...(patch.decision !== undefined ? { selected: patch.decision === "selected" } : {}),
    ...(direction ? { direction } : {}),
  };
  return request<BackendFactoryRunResponse>(
    `/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}`,
    json("PATCH", payload),
    { idempotencyKey, signal },
  ).then(adaptFactoryRunResponse);
}

export function generateCandidates(
  runId: string,
  candidateIds: readonly string[],
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  return request<BackendFactoryRunResponse>(`/runs/${encodeURIComponent(runId)}/generate`, json("POST", { candidate_ids: candidateIds }), {
    idempotencyKey,
    signal,
  }).then(adaptFactoryRunResponse);
}

export function getDraft(candidateId: string, signal?: AbortSignal): Promise<ApiResponse<CharacterDraft>> {
  return clarifyMissingEndpoint(
    request<BackendCharacterDraftResponse>(
      `/candidates/${encodeURIComponent(candidateId)}/draft`,
      { method: "GET" },
      { signal },
    ).then(adaptCharacterDraft),
    "角色草稿读取",
  );
}

export function updateDraft(
  candidateId: string,
  expectedRevision: number,
  draft: CharacterDraft,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<CharacterDraft>> {
  return clarifyMissingEndpoint(
    request<BackendCharacterDraftResponse>(
      `/candidates/${encodeURIComponent(candidateId)}/draft`,
      json("PATCH", { expected_revision: expectedRevision, content: draftContent(draft) }),
      { expectedRevision, idempotencyKey, signal },
    ).then(adaptCharacterDraft),
    "角色草稿更新",
  );
}

export function createAgentRevision(
  candidateId: string,
  body: AgentRevisionRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryTask>> {
  return clarifyMissingEndpoint(
    request<BackendFactoryTaskResponse>(
      `/candidates/${encodeURIComponent(candidateId)}/agent-revisions`,
      json("POST", body),
      { idempotencyKey, signal },
    ).then(adaptFactoryTaskResponse),
    "Agent 修改",
  );
}

export function applyAgentRevision(
  candidateId: string,
  taskId: string,
  expectedRevision: number,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<CharacterDraft>> {
  return clarifyMissingEndpoint(
    request<BackendCharacterDraftResponse>(
      `/candidates/${encodeURIComponent(candidateId)}/agent-revisions/${encodeURIComponent(taskId)}/apply`,
      json("POST", { expected_revision: expectedRevision }),
      { expectedRevision, idempotencyKey, signal },
    ).then(adaptCharacterDraft),
    "Agent 修改应用",
  );
}

export function createPreviewTurn(
  candidateId: string,
  body: PreviewTurnRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<PreviewTurnResult>> {
  return clarifyMissingEndpoint(
    request<ApiResponse<PreviewTurnResult>>(`/candidates/${encodeURIComponent(candidateId)}/preview-turns`, json("POST", body), {
      idempotencyKey,
      signal,
    }),
    "对话测试",
  );
}

export function retryTask(
  taskId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  return request<BackendFactoryRunResponse>(`/tasks/${encodeURIComponent(taskId)}/retry`, json("POST", {}), {
    idempotencyKey,
    signal,
  }).then(adaptFactoryRunResponse);
}

export function preflightRun(
  runId: string,
  candidateIds: readonly string[],
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  return clarifyMissingEndpoint(
    request<BackendFactoryRunResponse>(`/runs/${encodeURIComponent(runId)}/preflight`, json("POST", { candidate_ids: candidateIds }), {
      idempotencyKey,
      signal,
    }).then(adaptFactoryRunResponse),
    "投稿预检",
  );
}

export function submitRun(
  runId: string,
  body: SubmissionConfirmation,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ApiResponse<FactoryRunSnapshot>> {
  return clarifyMissingEndpoint(
    request<BackendFactoryRunResponse>(`/runs/${encodeURIComponent(runId)}/submit`, json("POST", body), {
      idempotencyKey,
      signal,
    }).then(adaptFactoryRunResponse),
    "批量提交",
  );
}
