import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveRunStatus,
  isFactoryTaskTerminal,
  isRunPollingTerminal,
  summarizeRun,
} from "../features/character-factory/contracts.ts";
import { FactoryApiError } from "../features/character-factory/api.ts";
import { nextBatchStage } from "../features/character-factory/multi-lifecycle.ts";
import { resolveSingleRun } from "../features/character-factory/single-lifecycle.ts";
import {
  FACTORY_POLL_INTERVAL_MS,
  factoryPollRetryDelay,
} from "../features/character-factory/polling.ts";
import { uploadFactorySourceFiles } from "../features/character-factory/media-upload.ts";
import {
  readAgentRevisionPreview,
  resolveAgentRevisionTask,
} from "../features/character-factory/agent-revision.ts";
import {
  preflightReadyIds,
  submissionFailureMessage,
} from "../features/character-factory/submission.ts";
import {
  INITIAL_FACTORY_STATE,
  factoryReducer,
} from "../features/character-factory/reducer.ts";
import {
  imageRunInputReady,
  imageWorkflowStep,
  shouldPollImageRun,
} from "../features/character-factory/image-workflow.ts";

test("image workflow maps backend states to stable UI steps", () => {
  assert.equal(imageWorkflowStep("empty"), 0);
  assert.equal(imageWorkflowStep("prompt_ready"), 1);
  assert.equal(imageWorkflowStep("candidates_ready"), 2);
  assert.equal(imageWorkflowStep("editing"), 3);
  assert.equal(imageWorkflowStep("finalized"), 4);
  assert.equal(shouldPollImageRun("generating"), true);
  assert.equal(shouldPollImageRun("candidates_ready"), false);
  assert.equal(shouldPollImageRun("editing"), false);
  assert.equal(shouldPollImageRun("editing", ["succeeded", "running"]), true);
  assert.equal(imageRunInputReady("", 0, "owner"), false);
  assert.equal(imageRunInputReady("portrait", 0, "owner"), true);
  assert.equal(imageRunInputReady("", 1, "owner"), true);
  assert.equal(imageRunInputReady("portrait", 0, ""), false);
});

const now = "2026-09-09T00:00:00.000Z";

function candidate(id, overrides = {}) {
  return {
    id,
    run_id: "run_1",
    decision: "selected",
    title: id,
    description: "",
    reference_image_urls: [],
    evidence: [],
    work_id: null,
    draft_revision: null,
    preflight: null,
    submission: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function task(type, status, overrides = {}) {
  return {
    id: `task_${type}_${status}`,
    task_key: `${type}:run_1`,
    run_id: "run_1",
    candidate_id: null,
    type,
    status,
    cycle: 1,
    attempt: 1,
    is_current: true,
    timeout_seconds: 60,
    provider: null,
    model: null,
    prompt_version: null,
    policy_version: null,
    error: null,
    output: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function run(status = "not_started", contentMode = "limited") {
  return {
    id: "run_1",
    kind: "single",
    status,
    content_mode: contentMode,
    source: { type: "text", description: "idea" },
    creative_intent: "",
    language: "zh-CN",
    market: "CN",
    owner_platform_user_id: "pu_1",
    target_count: 1,
    submission_batch_id: null,
    created_at: now,
    updated_at: now,
  };
}

function snapshot(candidates = [], tasks = [], status = "not_started", contentMode = "limited") {
  return {
    run: run(status, contentMode),
    candidates,
    tasks,
    progress: { total: 999, selected: 999, running: 999, failed: 999, drafts: 999, submitted: 999 },
  };
}

test("Run status follows parsing, generating, failure, submitted, draft priority", () => {
  const ready = candidate("c1", { work_id: "work_1", draft_revision: 2 });
  const submitted = candidate("c1", {
    work_id: "work_1",
    draft_revision: 2,
    submission: {
      status: "published",
      character_id: "char_1",
      work_id: "work_1",
      draft_revision: 2,
      version_number: 1,
      review_id: null,
      error_code: null,
      error_message: null,
      submitted_at: now,
    },
  });

  assert.equal(deriveRunStatus([ready], [task("source_parse", "running"), task("text_generate", "failed")]), "parsing");
  assert.equal(deriveRunStatus([ready], [task("image_generate", "queued"), task("source_parse", "failed")]), "generating");
  assert.equal(deriveRunStatus([ready], [task("image_generate", "failed")]), "partial_failed");
  assert.equal(deriveRunStatus([submitted], []), "submitted");
  assert.equal(deriveRunStatus([ready], []), "draft");
  assert.equal(deriveRunStatus([], []), "not_started");
});

test("superseded failed attempts do not poison a successful retry", () => {
  const ready = candidate("c1", { work_id: "work_1", draft_revision: 1 });
  const failed = task("text_generate", "failed", { id: "old", is_current: false, attempt: 1 });
  const succeeded = task("text_generate", "succeeded", { id: "new", attempt: 2 });
  assert.equal(deriveRunStatus([ready], [failed, succeeded]), "draft");
});

test("partial submission stays draft and progress reports submitted over selected", () => {
  const first = candidate("c1", {
    work_id: "work_1",
    draft_revision: 1,
    submission: {
      status: "pending_review",
      character_id: "char_1",
      work_id: "work_1",
      draft_revision: 1,
      version_number: 1,
      review_id: "review_1",
      error_code: null,
      error_message: null,
      submitted_at: now,
    },
  });
  const second = candidate("c2", { work_id: "work_2", draft_revision: 1 });
  const progress = summarizeRun([first, second], []);
  assert.deepEqual(progress, { total: 2, selected: 2, running: 0, failed: 0, drafts: 2, submitted: 1 });
  assert.equal(deriveRunStatus([first, second], []), "draft");
});

test("polling stops for every quiescent Run state", () => {
  assert.equal(isRunPollingTerminal("parsing"), false);
  assert.equal(isRunPollingTerminal("generating"), false);
  for (const status of ["not_started", "draft", "partial_failed", "submitted"]) {
    assert.equal(isRunPollingTerminal(status), true, status);
  }
  assert.equal(isFactoryTaskTerminal("running"), false);
  assert.equal(isFactoryTaskTerminal("cancelled"), true);
});

test("batch UI stages follow remote lifecycle snapshots", () => {
  assert.equal(nextBatchStage("source", snapshot([], [], "parsing")), "discovering");
  assert.equal(nextBatchStage("pool", snapshot([], [task("text_generate", "running")], "generating")), "generating");
  assert.equal(
    nextBatchStage("discovering", snapshot([], [task("candidate_plan", "succeeded")], "draft")),
    "pool",
  );
  assert.equal(nextBatchStage("generating", snapshot([], [], "partial_failed")), "review");
  assert.equal(
    nextBatchStage("discovering", snapshot([], [task("candidate_plan", "failed")], "partial_failed")),
    "discovery_failed",
  );
  assert.equal(nextBatchStage("review", snapshot([], [], "submitted")), "submitted");
});

test("planned remote candidates stay editable until generation tasks exist", () => {
  const planned = snapshot(
    [candidate("c1", { status: "selected" })],
    [task("candidate_plan", "succeeded")],
    "generating",
  );
  for (const stage of ["discovering", "discovery_failed", "pool", "generating"]) {
    assert.equal(nextBatchStage(stage, planned), "pool", stage);
  }
  const generating = {
    ...planned,
    tasks: [...planned.tasks, task("text_generate", "queued")],
  };
  assert.equal(nextBatchStage("pool", generating), "generating");
});

test("polling retries transient failures with bounded backoff", () => {
  const transient = new FactoryApiError(503, "provider_busy", "busy", "req_1", true);
  assert.equal(factoryPollRetryDelay(transient, 1), FACTORY_POLL_INTERVAL_MS);
  assert.equal(factoryPollRetryDelay(transient, 2), 3_000);
  assert.equal(factoryPollRetryDelay(transient, 20), 12_000);
  assert.equal(
    factoryPollRetryDelay(new FactoryApiError(429, "rate_limited", "slow", undefined, true, 20_000), 1),
    20_000,
  );
  assert.equal(factoryPollRetryDelay(new FactoryApiError(404, "not_found", "missing"), 1), null);
  assert.equal(factoryPollRetryDelay(new Error("unknown"), 1), null);
});

test("single UI waits for the backend and loads only a real draft candidate", () => {
  assert.deepEqual(resolveSingleRun(snapshot([], [], "generating")), { type: "poll" });
  assert.deepEqual(
    resolveSingleRun(snapshot([
      candidate("unselected", { decision: "proposed", work_id: "work_1" }),
      candidate("selected", { decision: "selected", work_id: "work_2" }),
    ], [], "draft")),
    { type: "load_draft", candidateId: "selected" },
  );
  assert.deepEqual(
    resolveSingleRun(snapshot([], [], "partial_failed")),
    { type: "failed", message: "生成部分失败，后端未返回可编辑草稿。" },
  );
});

test("factory source uploads keep order, owner scope, retry cache, and max concurrency", async () => {
  const files = Array.from({ length: 5 }, (_, index) => ({ name: `image-${index}.png` }));
  const done = new Map([[files[0], "media-cached"]]);
  const owners = [];
  let active = 0;
  let peak = 0;
  const uploader = async (file, owner) => {
    owners.push(owner);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, file.name === "image-2.png" ? 5 : 1));
    active -= 1;
    if (file.name === "image-3.png") throw new Error("upload failed");
    return `media-${file.name}`;
  };

  const result = await uploadFactorySourceFiles(files, "owner-1", { done, uploader });
  assert.ok(peak <= 3);
  assert.deepEqual(owners, ["owner-1", "owner-1", "owner-1", "owner-1"]);
  assert.deepEqual(result.mediaIds, [
    "media-cached",
    "media-image-1.png",
    "media-image-2.png",
    null,
    "media-image-4.png",
  ]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].file, files[3]);
  assert.equal(result.uploaded.get(files[0]), "media-cached");
});

test("reducer normalizes stale server aggregates and preserves limitless", () => {
  let state = factoryReducer(INITIAL_FACTORY_STATE, {
    type: "request_started",
    operation: "poll",
    requestId: "req_1",
  });
  state = factoryReducer(state, {
    type: "snapshot_received",
    operation: "poll",
    requestId: "req_1",
    snapshot: snapshot([candidate("c1", { work_id: "w1", draft_revision: 1 })], [], "generating", "limitless"),
  });
  assert.equal(state.snapshot.run.status, "draft");
  assert.equal(state.snapshot.run.content_mode, "limitless");
  assert.equal(state.snapshot.progress.drafts, 1);
});

test("a stale poll response cannot overwrite the latest request", () => {
  let state = factoryReducer(INITIAL_FACTORY_STATE, {
    type: "request_started",
    operation: "poll",
    requestId: "old",
  });
  state = factoryReducer(state, { type: "request_started", operation: "poll", requestId: "new" });
  const unchanged = factoryReducer(state, {
    type: "snapshot_received",
    operation: "poll",
    requestId: "old",
    snapshot: snapshot([], [task("source_parse", "running")]),
  });
  assert.equal(unchanged, state);
});

test("request errors retain machine-readable retry guidance", () => {
  let state = factoryReducer(INITIAL_FACTORY_STATE, {
    type: "request_started",
    operation: "generate",
    requestId: "req_1",
  });
  state = factoryReducer(state, {
    type: "request_failed",
    operation: "generate",
    requestId: "req_1",
    error: new FactoryApiError(429, "rate_limited", "slow down", "request_1", true, 2_000),
  });
  assert.deepEqual(state.error, {
    status: 429,
    code: "rate_limited",
    message: "slow down",
    requestId: "request_1",
    retryable: true,
    retryAfterMs: 2_000,
  });
  assert.deepEqual(state.pending, {});
});

test("partial preflight selects only explicitly ready candidates", () => {
  const first = candidate("c1", {
    preflight: {
      candidate_id: "c1",
      ready: true,
      issues: [],
      work_id: "w1",
      draft_revision: 2,
      prompt_budget: null,
    },
  });
  const second = candidate("c2", {
    preflight: {
      candidate_id: "c2",
      ready: false,
      issues: [{ code: "intro_required", message: "简介不能为空" }],
      work_id: "w2",
      draft_revision: 1,
      prompt_budget: null,
    },
  });
  assert.deepEqual(preflightReadyIds(snapshot([first, second]), ["c1", "c2"]), ["c1"]);
});

test("submission failures retain the backend reason", () => {
  const failed = candidate("c1", {
    submission: {
      status: "failed",
      character_id: null,
      work_id: "w1",
      draft_revision: 3,
      version_number: null,
      review_id: null,
      error_code: "publish_failed",
      error_message: "图片审核服务不可用",
      submitted_at: now,
    },
  });
  assert.equal(submissionFailureMessage(failed), "图片审核服务不可用");
});

test("agent revision previews reject unknown fields and report image provider outages", () => {
  const valid = readAgentRevisionPreview({
    revision_preview: {
      expected_revision: 3,
      changes: [{ field: "intro", before: "旧简介", after: "新简介" }],
    },
  });
  assert.equal(valid?.changes[0].field, "intro");
  assert.equal(readAgentRevisionPreview({
    revision_preview: {
      expected_revision: 3,
      changes: [{ field: "visibility", before: "private", after: "public" }],
    },
  }), null);
  const imageState = {
    portrait_media_id: "mda_before",
    image_set_id: "imgset_before",
    portrait_crop: null,
    avatar_crop: null,
    portrait_position_x: 50,
    portrait_position_y: 50,
    portrait_zoom: 100,
    avatar_position_x: 50,
    avatar_position_y: 50,
    avatar_zoom: 100,
  };
  const imagePreview = readAgentRevisionPreview({
    revision_preview: {
      expected_revision: 3,
      image_change: {
        before: imageState,
        after: { ...imageState, portrait_media_id: "mda_after", image_set_id: "imgset_after" },
      },
    },
  });
  assert.equal(imagePreview?.image_change.after.portrait_media_id, "mda_after");
  assert.equal(readAgentRevisionPreview({
    revision_preview: {
      expected_revision: 3,
      image_change: { before: imageState, after: imageState },
    },
  }), null);
  assert.deepEqual(resolveAgentRevisionTask(task("revise_image", "failed", {
    error: { code: "image_provider_unavailable", message: "down", retryable: false },
  }), "image"), {
    type: "failed",
    message: "图片修改服务当前不可用，可使用上传替换。",
    unavailable: true,
  });
});

test("a new task attempt supersedes the previous attempt with the same task key", () => {
  let state = factoryReducer(INITIAL_FACTORY_STATE, {
    type: "request_started",
    operation: "load",
    requestId: "load_1",
  });
  state = factoryReducer(state, {
    type: "snapshot_received",
    operation: "load",
    requestId: "load_1",
    snapshot: snapshot([], [task("text_generate", "failed", { id: "attempt_1" })]),
  });
  state = factoryReducer(state, {
    type: "request_started",
    operation: "retry:task",
    requestId: "retry_1",
  });
  state = factoryReducer(state, {
    type: "task_received",
    operation: "retry:task",
    requestId: "retry_1",
    task: task("text_generate", "queued", { id: "attempt_2", attempt: 2 }),
  });
  assert.equal(state.snapshot.tasks.find((item) => item.id === "attempt_1").is_current, false);
  assert.equal(state.snapshot.run.status, "generating");
});
