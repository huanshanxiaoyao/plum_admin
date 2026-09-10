import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, role: "operator" | "admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: role === "admin" ? "Admin" : "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

test("operator reaches the review queue and filters it by disposition", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/moderation");
  await expect(page.getByRole("heading", { name: "内容复核" })).toBeVisible();
  await expect(page.getByLabel("队列积压")).toContainText("待处理");

  // 队列默认按等待时间正序：最久没人处理的排在最前面。
  const links = page.getByRole("region", { name: "复核队列" }).getByRole("link");
  await expect(links.first()).toHaveAttribute("href", "/moderation/rev_accept_purged");

  await page.getByLabel("复核状态").selectOption("pending");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/status=pending/);
  await expect(page.getByRole("link", { name: "Nyx" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kestrel" })).toHaveCount(0);
});

test("review detail shows the reviewed text and says the read was audited", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/moderation/rev_accept_pending");
  await expect(page.getByRole("heading", { name: "Nyx", exact: true })).toBeVisible();
  await expect(page.getByText("这次读取已按明文访问记入审计")).toBeVisible();
  await expect(page.getByText("A night-shift paramedic")).toBeVisible();
  await expect(page.getByText("violence_description")).toBeVisible();

  // 三处置齐备，且各自说清后果。
  await expect(page.getByRole("radio", { name: /通过 · 放出/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /不通过 · 自见/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /高危清除 · 不保留/ })).toBeVisible();
});

test("fixture data source disables dispositions instead of failing on submit", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/moderation/rev_accept_pending");
  await expect(page.getByText("当前是 fixture 数据源，处置动作不可用。")).toBeVisible();
  await expect(page.getByRole("button", { name: "认领" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "提交处置" })).toBeDisabled();
});

test("closed reviews expose no disposition control and purged bodies are explained", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/moderation/rev_accept_purged");
  await expect(page.getByText("该复核已是终态，不能再处置。")).toBeVisible();
  await expect(page.getByRole("button", { name: "提交处置" })).toHaveCount(0);
  await expect(page.getByText("该内容已被下架处置，服务端不再保留正文。")).toBeVisible();
});

test("moderation proxy accepts the queue routes and still rejects neighbours", async ({ page }) => {
  await signIn(page, "operator");
  // 允许：路由在 allowlist 内，fixture 环境没有后端可打，因此止步于 503 而不是 404。
  const claim = await page.request.post("/api/admin/moderation/reviews/rev-01/claim");
  expect(claim.status()).toBe(503);
  expect((await claim.json()).error.code).toBe("dependency_unavailable");

  // 拒绝：相邻但未登记的路径必须继续当作不存在。
  for (const path of ["/api/admin/moderation/reviews/rev-01/purge", "/api/admin/moderation/tasks"]) {
    const response = await page.request.post(path);
    expect(response.status(), path).toBe(404);
    expect((await response.json()).error.code, path).toBe("resource_not_found");
  }
});
