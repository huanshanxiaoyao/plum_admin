import {
  deriveRunStatus,
  summarizeRun,
  type CharacterDraft,
  type FactoryCandidate,
  type FactoryRunSnapshot,
  type FactoryTask,
} from "./contracts.ts";
import { FactoryApiError } from "./api.ts";

export type FactoryRequestError = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
};

export type FactoryState = {
  readonly snapshot: FactoryRunSnapshot | null;
  readonly drafts: Readonly<Record<string, CharacterDraft>>;
  /** Operation keys may include an entity id, for example `candidate:abc`. */
  readonly pending: Readonly<Record<string, string>>;
  readonly error: FactoryRequestError | null;
};

export type FactoryAction =
  | { readonly type: "request_started"; readonly operation: string; readonly requestId: string }
  | {
      readonly type: "request_failed";
      readonly operation: string;
      readonly requestId: string;
      readonly error: unknown;
    }
  | {
      readonly type: "snapshot_received";
      readonly operation: string;
      readonly requestId: string;
      readonly snapshot: FactoryRunSnapshot;
    }
  | {
      readonly type: "candidate_received";
      readonly operation: string;
      readonly requestId: string;
      readonly candidate: FactoryCandidate;
    }
  | {
      readonly type: "task_received";
      readonly operation: string;
      readonly requestId: string;
      readonly task: FactoryTask;
    }
  | {
      readonly type: "draft_received";
      readonly operation: string;
      readonly requestId: string;
      readonly draft: CharacterDraft;
    }
  | { readonly type: "clear_error" }
  | { readonly type: "reset" };

export const INITIAL_FACTORY_STATE: FactoryState = {
  snapshot: null,
  drafts: {},
  pending: {},
  error: null,
};

function finish(pending: Readonly<Record<string, string>>, operation: string): Readonly<Record<string, string>> {
  const next = { ...pending };
  delete next[operation];
  return next;
}

function isCurrent(state: FactoryState, operation: string, requestId: string): boolean {
  return state.pending[operation] === requestId;
}

function requestError(error: unknown): FactoryRequestError {
  if (error instanceof FactoryApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    };
  }
  if (error instanceof Error) {
    return { status: 0, code: "unexpected_error", message: error.message, retryable: false };
  }
  return { status: 0, code: "unexpected_error", message: "请求失败，请稍后重试。", retryable: false };
}

function normalizeSnapshot(snapshot: FactoryRunSnapshot): FactoryRunSnapshot {
  return {
    ...snapshot,
    run: { ...snapshot.run, status: deriveRunStatus(snapshot.candidates, snapshot.tasks) },
    progress: summarizeRun(snapshot.candidates, snapshot.tasks),
  };
}

function updateSnapshot(
  snapshot: FactoryRunSnapshot,
  candidates: readonly FactoryCandidate[],
  tasks: readonly FactoryTask[],
): FactoryRunSnapshot {
  return normalizeSnapshot({ ...snapshot, candidates, tasks });
}

export function factoryReducer(state: FactoryState, action: FactoryAction): FactoryState {
  switch (action.type) {
    case "request_started":
      return {
        ...state,
        pending: { ...state.pending, [action.operation]: action.requestId },
        error: null,
      };
    case "request_failed":
      if (!isCurrent(state, action.operation, action.requestId)) return state;
      return {
        ...state,
        pending: finish(state.pending, action.operation),
        error: requestError(action.error),
      };
    case "snapshot_received":
      if (!isCurrent(state, action.operation, action.requestId)) return state;
      return {
        ...state,
        snapshot: normalizeSnapshot(action.snapshot),
        pending: finish(state.pending, action.operation),
        error: null,
      };
    case "candidate_received": {
      if (!isCurrent(state, action.operation, action.requestId) || !state.snapshot) return state;
      const exists = state.snapshot.candidates.some((candidate) => candidate.id === action.candidate.id);
      const candidates = exists
        ? state.snapshot.candidates.map((candidate) =>
            candidate.id === action.candidate.id ? action.candidate : candidate,
          )
        : [...state.snapshot.candidates, action.candidate];
      return {
        ...state,
        snapshot: updateSnapshot(state.snapshot, candidates, state.snapshot.tasks),
        pending: finish(state.pending, action.operation),
        error: null,
      };
    }
    case "task_received": {
      if (!isCurrent(state, action.operation, action.requestId) || !state.snapshot) return state;
      const tasks = [
        ...state.snapshot.tasks.map((task) =>
          task.task_key === action.task.task_key && task.id !== action.task.id
            ? { ...task, is_current: false }
            : task,
        ),
      ];
      const index = tasks.findIndex((task) => task.id === action.task.id);
      if (index >= 0) tasks[index] = action.task;
      else tasks.push(action.task);
      return {
        ...state,
        snapshot: updateSnapshot(state.snapshot, state.snapshot.candidates, tasks),
        pending: finish(state.pending, action.operation),
        error: null,
      };
    }
    case "draft_received":
      if (!isCurrent(state, action.operation, action.requestId)) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [action.draft.candidate_id]: action.draft },
        pending: finish(state.pending, action.operation),
        error: null,
      };
    case "clear_error":
      return { ...state, error: null };
    case "reset":
      return INITIAL_FACTORY_STATE;
  }
}
