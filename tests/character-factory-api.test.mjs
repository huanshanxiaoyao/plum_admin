import assert from "node:assert/strict";
import test from "node:test";
import {
  FactoryApiError,
  characterFactoryDraftPortraitUrl,
  characterFactoryRevisionImageUrl,
  createRun,
  getDraft,
  getRun,
  getRunCosts,
  updateDraft,
} from "../features/character-factory/api.ts";

test("character factory image URLs stay candidate and revision scoped", () => {
  assert.equal(
    characterFactoryRevisionImageUrl("candidate/a", "task?1", "after"),
    "/api/admin/character-factory/candidates/candidate%2Fa/agent-revisions/task%3F1/preview-image/after",
  );
  assert.equal(
    characterFactoryDraftPortraitUrl("candidate/a", 7),
    "/api/admin/character-factory/candidates/candidate%2Fa/draft/portrait?revision=7",
  );
});

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

test("getRunCosts preserves unknown amounts and scopes an abortable read to the run", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  const data = {
    tracking_enabled: true,
    tracking_incomplete: false,
    missing_calls: 0,
    currency: "USD",
    totals: { cost_usd_micros: null, known_cost_usd_micros: 12345, input_tokens: null, output_tokens: 300, total_calls: 3, unpriced_calls: 1, pending_calls: 1 },
    shared: { cost_usd_micros: 2345, known_cost_usd_micros: 2345, input_tokens: 1200, output_tokens: 300, total_calls: 1, unpriced_calls: 0, pending_calls: 0 },
    candidates: [],
    phases: [],
    calls: [],
  };
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ data, request_id: "req-cost" });
  };
  const response = await getRunCosts("run/a?b", controller.signal);
  assert.equal(captured.url, "/api/admin/character-factory/runs/run%2Fa%3Fb/costs");
  assert.equal(captured.init.method, "GET");
  assert.equal(captured.init.signal, controller.signal);
  assert.deepEqual(response.data, data);
});

function createBody(contentMode) {
  return {
    kind: "single",
    ...(contentMode ? { content_mode: contentMode } : {}),
    source: { type: "text", description: "quiet bookseller" },
    creative_intent: "slow relationship",
    language: "en",
    market: "US",
    owner_platform_user_id: "pu_1",
    target_count: 1,
  };
}

function runResponse(overrides = {}) {
  const now = "2026-09-09T00:00:00.000Z";
  return {
    data: {
      id: "run_1",
      operator_open_id: "operator_1",
      owner_platform_user_id: "pu_1",
      kind: "single",
      content_mode: "limited",
      source_type: "text",
      source_payload: { description: "quiet bookseller" },
      creative_intent: "slow relationship",
      language: "en",
      market: "US",
      target_count: 1,
      status: "not_started",
      created_at: now,
      updated_at: now,
      progress: {
        candidate_total: 1,
        candidate_selected: 1,
        candidate_draft: 0,
        candidate_failed: 0,
        candidate_submitted: 0,
        task_total: 0,
        task_pending: 0,
        task_running: 0,
        task_succeeded: 0,
        task_failed: 0,
      },
      candidates: [{
        id: "candidate_1",
        run_id: "run_1",
        ordinal: 1,
        status: "planned",
        direction: { title: "Quiet Bookseller", description: "Keeps the light on." },
        selected: true,
        created_at: now,
        updated_at: now,
      }],
      tasks: [],
      ...overrides,
    },
    meta: { request_id: "req_1" },
  };
}

function characterDraft(overrides = {}) {
  return {
    candidate_id: "candidate_1",
    work_id: "work_1",
    revision: 7,
    owner_platform_user_id: "pu_1",
    display_name: "Luna",
    gender: "female",
    portrait_media_id: "portrait_1",
    image_set_id: "images_1",
    portrait_crop: null,
    avatar_crop: null,
    portrait_position_x: 50,
    portrait_position_y: 50,
    portrait_zoom: 100,
    avatar_position_x: 50,
    avatar_position_y: 50,
    avatar_zoom: 100,
    intro: "Keeps the light on.",
    opening_scene: "The shop is closing.",
    character_settings: "Quiet and observant.",
    example_dialogues: "User: Hello.\nLuna: Welcome.",
    response_rules: "Keep replies concise.",
    tag_ids: ["quiet"],
    creator_declared_rating: "general",
    visibility: "private",
    adult_confirmed: false,
    rights_confirmed: false,
    updated_at: "2026-09-09T00:00:00.000Z",
    ...overrides,
  };
}

function backendDraftResponse(draft = characterDraft()) {
  const {
    candidate_id,
    work_id,
    revision,
    owner_platform_user_id,
    updated_at,
    ...content
  } = draft;
  return {
    data: { candidate_id, work_id, revision, owner_platform_user_id, content, updated_at },
    meta: { request_id: "req_draft" },
  };
}

test("createRun defaults to limited and sends the idempotency key", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(runResponse());
  };

  const created = await createRun(createBody(), "create:1");
  assert.equal(captured.url, "/api/admin/character-factory/runs");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.get("Idempotency-Key"), "create:1");
  assert.deepEqual(JSON.parse(captured.init.body), {
    kind: "single",
    content_mode: "limited",
    source_type: "text",
    source_payload: { description: "quiet bookseller" },
    creative_intent: "slow relationship",
    language: "en",
    market: "US",
    owner_platform_user_id: "pu_1",
    target_count: 1,
  });
  assert.equal(created.data.run.id, "run_1");
  assert.equal(created.data.candidates[0].title, "Quiet Bookseller");
  assert.equal(created.data.candidates[0].decision, "selected");
});

test("createRun preserves an explicit limitless mode", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return jsonResponse(runResponse({ content_mode: "limitless" }));
  };
  const created = await createRun(createBody("limitless"), "create:2");
  assert.equal(payload.content_mode, "limitless");
  assert.equal(created.data.run.content_mode, "limitless");
});

test("run adaptation preserves draft, preflight, and submission receipts", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const now = "2026-09-09T00:00:00.000Z";
  globalThis.fetch = async () => jsonResponse(runResponse({
    status: "submitted",
    candidates: [{
      id: "candidate_1",
      run_id: "run_1",
      ordinal: 1,
      status: "submitted",
      direction: { title: "Quiet Bookseller" },
      selected: true,
      work_id: "work_1",
      draft_revision: 4,
      character_id: "character_1",
      preflight: {
        candidate_id: "candidate_1",
        ready: true,
        issues: [],
        work_id: "work_1",
        draft_revision: 4,
        prompt_budget: {
          total_tokens: 120,
          over_limit: false,
          blocks: [{ block: "intro", tokens: 12, limit: 100, over_limit: false, required: true }],
        },
      },
      submission: {
        status: "pending_review",
        character_id: "character_1",
        work_id: "work_1",
        draft_revision: 4,
        version_number: 2,
        review_id: "review_1",
        error_code: null,
        error_message: null,
        submitted_at: now,
      },
      created_at: now,
      updated_at: now,
    }],
  }));

  const response = await getRun("run_1");
  assert.equal(response.data.candidates[0].status, "submitted");
  assert.equal(response.data.candidates[0].work_id, "work_1");
  assert.equal(response.data.candidates[0].draft_revision, 4);
  assert.equal(response.data.candidates[0].preflight.ready, true);
  assert.equal(response.data.candidates[0].preflight.prompt_budget.blocks[0].block, "intro");
  assert.equal(response.data.candidates[0].submission.status, "pending_review");
  assert.equal(response.data.candidates[0].submission.review_id, "review_1");
  assert.equal(response.data.candidates[0].submission.submitted_at, now);
});

test("run adaptation marks only the newest task attempt current", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const now = "2026-09-09T00:00:00.000Z";
  const task = (id, attempt, status) => ({
    id,
    run_id: "run_1",
    candidate_id: "candidate_1",
    task_type: "text_generate",
    status,
    cycle: 1,
    attempt,
    max_auto_attempts: 2,
    timeout_seconds: 60,
    input: {},
    output: {},
    created_at: now,
    updated_at: now,
  });
  globalThis.fetch = async () => jsonResponse(runResponse({
    tasks: [task("attempt_1", 1, "failed"), task("attempt_2", 2, "running")],
  }));

  const response = await getRun("run_1");
  assert.equal(response.data.tasks[0].task_key, response.data.tasks[1].task_key);
  assert.equal(response.data.tasks[0].is_current, false);
  assert.equal(response.data.tasks[1].is_current, true);
});

test("missing draft endpoint reports a stable actionable error", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => jsonResponse(
    { error: { code: "not_found", message: "not found", request_id: "req_missing" } },
    { status: 404 },
  );

  await assert.rejects(
    () => getDraft("candidate_1"),
    (error) => error instanceof FactoryApiError &&
      error.code === "endpoint_unavailable" &&
      error.message === "角色草稿读取后端端点尚未接入。" &&
      error.requestId === "req_missing",
  );
});

test("draft reads flatten backend metadata and content without dropping fields", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const expected = characterDraft({ gender: "", portrait_position_x: 42, rights_confirmed: true });
  globalThis.fetch = async () => jsonResponse(backendDraftResponse(expected));

  const response = await getDraft("candidate_1");
  assert.deepEqual(response.data, expected);
});

test("draft updates carry the same expected revision in body and If-Match", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(backendDraftResponse());
  };
  const draft = characterDraft();
  await updateDraft("candidate/a", 7, draft, "draft:7");
  assert.equal(captured.url, "/api/admin/character-factory/candidates/candidate%2Fa/draft");
  assert.equal(captured.init.headers.get("If-Match"), '"7"');
  assert.equal(captured.init.headers.get("Idempotency-Key"), "draft:7");
  assert.deepEqual(JSON.parse(captured.init.body), {
    expected_revision: 7,
    content: {
      display_name: "Luna",
      gender: "female",
      portrait_media_id: "portrait_1",
      image_set_id: "images_1",
      portrait_crop: null,
      avatar_crop: null,
      portrait_position_x: 50,
      portrait_position_y: 50,
      portrait_zoom: 100,
      avatar_position_x: 50,
      avatar_position_y: 50,
      avatar_zoom: 100,
      intro: "Keeps the light on.",
      opening_scene: "The shop is closing.",
      character_settings: "Quiet and observant.",
      example_dialogues: "User: Hello.\nLuna: Welcome.",
      response_rules: "Keep replies concise.",
      tag_ids: ["quiet"],
      creator_declared_rating: "general",
      visibility: "private",
      adult_confirmed: false,
      rights_confirmed: false,
    },
  });
});

test("structured errors preserve request id, retryable and Retry-After", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    jsonResponse(
      {
        error: {
          code: "provider_busy",
          message: "busy",
          request_id: "req_429",
          retryable: true,
        },
      },
      { status: 429, headers: { "Retry-After": "3" } },
    );

  await assert.rejects(
    () => getRun("run_1"),
    (error) => {
      assert.ok(error instanceof FactoryApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "provider_busy");
      assert.equal(error.requestId, "req_429");
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfterMs, 3_000);
      return true;
    },
  );
});

test("network and non-JSON failures become actionable FactoryApiError values", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  await assert.rejects(
    () => getRun("run_1"),
    (error) => error instanceof FactoryApiError && error.code === "network_error" && error.retryable,
  );

  globalThis.fetch = async () =>
    new Response("gateway", { status: 503, headers: { "Content-Type": "text/plain", "X-Request-Id": "req_503" } });
  await assert.rejects(
    () => getRun("run_1"),
    (error) =>
      error instanceof FactoryApiError &&
      error.code === "unexpected_response" &&
      error.requestId === "req_503" &&
      error.retryable,
  );

  globalThis.fetch = async () =>
    new Response("not-json", {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": "req_broken_json" },
    });
  await assert.rejects(
    () => getRun("run_1"),
    (error) =>
      error instanceof FactoryApiError &&
      error.code === "unexpected_response" &&
      error.requestId === "req_broken_json",
  );
});
