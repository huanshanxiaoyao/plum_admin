import { expect, test, type Page } from "@playwright/test";

const costsRoute = "**/api/admin/character-factory/runs/*/costs";

function metrics(cost: number | null, known = cost ?? 0, calls = 1) {
  return {
    cost_usd_micros: cost,
    known_cost_usd_micros: known,
    input_tokens: 1200,
    output_tokens: 300,
    total_calls: calls,
    unpriced_calls: cost === null ? 1 : 0,
    pending_calls: 0,
  };
}

function report(partial = false) {
  return {
    tracking_enabled: true,
    tracking_incomplete: false,
    missing_calls: 0,
    currency: "USD",
    totals: metrics(partial ? null : 12345, 12345, partial ? 3 : 2),
    shared: metrics(2345),
    candidates: [{ candidate_id: "candidate-01", ...metrics(partial ? null : 10000, 10000, partial ? 2 : 1) }],
    phases: [
      { phase: "candidate_plan", ...metrics(2345) },
      { phase: "text_generate", ...metrics(10000) },
      ...(partial ? [{ phase: "image_generate", ...metrics(null) }] : []),
    ],
    calls: [
      { id: "cost-shared", candidate_id: null, task_id: "task-discovery", phase: "candidate_plan", provider: "deepseek", provider_request_id: "provider-plan-1", model: "deepseek-v4-flash", status: "priced", cost_usd_micros: 2345, input_tokens: 1200, output_tokens: 300, created_at: "2026-09-10T10:00:00Z", cycle: 1, attempt: 1, outcome: "succeeded", error_code: null },
      { id: "cost-character", candidate_id: "candidate-01", task_id: "task-draft", phase: "text_generate", provider: "deepseek", provider_request_id: "provider-text-1", model: "deepseek-v4-flash", status: "priced", cost_usd_micros: 10000, input_tokens: 1200, output_tokens: 300, created_at: "2026-09-10T10:01:00Z", cycle: 1, attempt: 1, outcome: "succeeded", error_code: null },
      ...(partial ? [{ id: "cost-image", candidate_id: "candidate-01", task_id: "task-draft", phase: "image_generate", provider: "image-provider", provider_request_id: null, model: "unpriced-image-model-with-a-long-name-for-mobile-layout", status: "unpriced", cost_usd_micros: null, input_tokens: null, output_tokens: null, created_at: "2026-09-10T10:02:00Z", cycle: 1, attempt: 1, outcome: "failed", error_code: "invalid_image_result" }] : []),
    ],
  };
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

async function generateSingle(page: Page) {
  await page.goto("/character-factory/single");
  await page.getByLabel("文字描述").fill("都市雨夜里的慢热书店店员");
  await page.getByRole("button", { name: "生成角色" }).click();
  await expect(page.getByRole("heading", { name: "角色草稿" })).toBeVisible();
}

async function discoverBatch(page: Page) {
  await page.goto("/character-factory/multi");
  await page.getByRole("button", { name: /纯文字描述/ }).click();
  await page.getByLabel("主题或角色风格").fill("红楼梦女性角色的现代都市改编");
  await page.getByLabel("角色数量").fill("5");
  await page.getByRole("button", { name: "交给 AI Agent" }).click();
  await expect(page.getByRole("heading", { name: "候选池" })).toBeVisible();
}

test("single costs preserve partial totals and refresh without losing the draft", async ({ page }, testInfo) => {
  let current = report(true);
  await page.route(costsRoute, (route) => route.fulfill({ json: { data: current, request_id: "req-cost" } }));
  await signIn(page);
  await generateSingle(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("已确认成本");
  await expect(panel).toContainText("$0.012345 USD");
  await panel.getByText(/^调用明细/).click();
  await expect(panel).toContainText("待确认");
  await expect(panel).toContainText("unpriced-image-model-with-a-long-name-for-mobile-layout");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("single-partial-costs.png") });

  current = report(false);
  await panel.getByRole("button", { name: "刷新成本" }).click();
  await expect(panel).toContainText("累计成本");
  await expect(panel).not.toContainText("已确认成本");
  await expect(panel).toContainText("$0.012345 USD");
  await expect(page.getByRole("heading", { name: "角色草稿" })).toBeVisible();
});

test("batch costs include shared work once and scope the character workbench", async ({ page }, testInfo) => {
  let current = report(false);
  await page.route(costsRoute, (route) => route.fulfill({ json: { data: current, request_id: "req-cost" } }));
  await page.route("**/api/admin/character-factory/candidates/*/draft/portrait?*", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
  await signIn(page);
  await discoverBatch(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel).toContainText("$0.012345 USD");
  const sharedRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "公共费用", exact: true }) });
  await expect(sharedRow).toHaveCount(1);
  await expect(sharedRow).toContainText("$0.002345");
  await expect(panel.getByRole("row").filter({ hasText: "克制的照顾者" })).toContainText("$0.010000");
  await page.getByRole("button", { name: "生成 5 个角色" }).click();
  const batch = page.getByRole("heading", { name: "批量任务" }).locator("xpath=ancestor::section");
  await expect(batch.getByText("生成失败 · 可单独重试")).toBeVisible();

  current = { ...report(false), totals: metrics(22345, 22345, 3), candidates: [{ candidate_id: "candidate-01", ...metrics(20000, 20000, 2) }] };
  await batch.getByRole("button", { name: "仅重试失败项" }).click();
  await expect(batch.getByRole("link")).toHaveCount(5);
  await panel.getByRole("button", { name: "刷新成本" }).click();
  await expect(panel).toContainText("$0.022345 USD");
  await expect(sharedRow).toHaveCount(1);
  await expect(sharedRow).toContainText("$0.002345");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("batch-costs.png") });

  await batch.getByRole("link", { name: /克制的照顾者/ }).click();
  await expect(page).toHaveURL(/\/candidate-01$/);
  await expect(panel).toContainText("$0.020000 USD");
  await expect(panel).not.toContainText("$0.022345 USD");
  await expect(page.getByRole("heading", { name: "描述修改" })).toBeVisible();
});

test("cost API failure leaves generation usable and refresh recovers", async ({ page }) => {
  let available = false;
  await page.route(costsRoute, (route) => available
    ? route.fulfill({ json: { data: report(), request_id: "req-cost" } })
    : route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "成本服务暂不可用" } } }));
  await signIn(page);
  await generateSingle(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel.getByRole("button", { name: "刷新成本" })).toBeVisible();
  await expect(panel).not.toContainText("$0.000000 USD");
  await expect(page.getByRole("heading", { name: "描述修改" })).toBeVisible();
  available = true;
  await panel.getByRole("button", { name: "刷新成本" }).click();
  await expect(panel).toContainText("$0.012345 USD");
});

test("untracked historical runs show no usage records instead of zero cost", async ({ page }) => {
  const empty = { ...metrics(null, 0, 0), input_tokens: null, output_tokens: null, unpriced_calls: 0 };
  await page.route(costsRoute, (route) => route.fulfill({ json: { data: { tracking_enabled: false, tracking_incomplete: false, missing_calls: 0, currency: "USD", totals: empty, shared: empty, candidates: [], phases: [], calls: [] }, request_id: "req-old" } }));
  await signIn(page);
  await generateSingle(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel).toContainText("无用量记录");
  await expect(panel).not.toContainText("$0.000000 USD");
});

test("missing ledger records retain confirmed cost and disclose incompleteness", async ({ page }) => {
  const incomplete = {
    ...report(),
    tracking_incomplete: true,
    missing_calls: 1,
    totals: { ...metrics(null, 12345, 2), unpriced_calls: 0 },
  };
  await page.route(costsRoute, (route) => route.fulfill({ json: { data: incomplete, request_id: "req-incomplete" } }));
  await signIn(page);
  await generateSingle(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel).toContainText("已确认成本");
  await expect(panel).toContainText("$0.012345 USD");
  await expect(panel).toContainText("用量记录不完整");
  await expect(panel).not.toContainText("累计成本");
  await expect(page.getByRole("heading", { name: "角色草稿" })).toBeVisible();
});

test("malformed cost reports do not crash the character editor", async ({ page }) => {
  await page.route(costsRoute, (route) => route.fulfill({ json: { data: { tracking_enabled: true, currency: "USD", totals: null }, request_id: "req-invalid" } }));
  await signIn(page);
  await generateSingle(page);
  const panel = page.getByLabel("调用成本", { exact: true });
  await expect(panel).toContainText("成本暂时无法读取");
  await expect(page.getByRole("heading", { name: "描述修改" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "对话测试" })).toBeVisible();
});
