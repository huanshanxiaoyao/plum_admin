import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, role: "operator" | "admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: role === "admin" ? "Admin" : "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

async function openNavigationIfNeeded(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 1280) > 820) return;
  const menuButton = page.getByRole("button", { name: "打开导航" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
}

test("operator sees daily navigation and is denied advanced actions", async ({ page }) => {
  await signIn(page, "operator");
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await openNavigationIfNeeded(page);
  await expect(page.getByRole("link", { name: "角色管理" })).toBeVisible();
  await expect(page.getByRole("link", { name: "后台成员" })).toHaveCount(0);

  await page.getByRole("link", { name: "角色管理" }).click();
  await expect(page.getByRole("heading", { name: "角色管理" })).toBeVisible();
  await expect(page.getByText("Ada", { exact: true })).toBeVisible();
  await expect(page.getByText("Ember", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Ember");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/q=Ember/);
  await expect(page.getByText("Ember", { exact: true })).toBeVisible();
  await expect(page.getByText("Ada", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Ember", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ember", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "版本记录" })).toBeVisible();
  await expect(page.getByText("仅展示不可变版本元数据，不包含 Prompt 或角色正文")).toBeVisible();
  await expect(page.getByText("content_json", { exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "返回 Character 列表" }).click();
  await page.getByRole("link", { name: "Work / 草稿" }).click();
  await expect(page).toHaveURL(/view=works/);
  await page.getByLabel("审核状态").selectOption("pending_review");
  await page.getByLabel("Owner").fill("North Window");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/moderation=pending_review/);
  await expect(page).toHaveURL(/owner=North\+Window/);
  await expect(page.getByRole("link", { name: "Haru", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Haru", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Haru", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "生命周期" })).toBeVisible();
  await expect(page.getByText("content_json", { exact: true })).toHaveCount(0);

  await openNavigationIfNeeded(page);
  await page.getByRole("link", { name: "创作者", exact: true }).click();
  await expect(page.getByRole("heading", { name: "创作者", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mira Studio", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("North Window");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/q=North\+Window/);
  await expect(page.getByRole("link", { name: "North Window", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "North Window", exact: true }).click();
  await expect(page.getByRole("heading", { name: "North Window", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创作产出" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公开内容表现" })).toBeVisible();
  await expect(page.getByText("资格受限", { exact: true })).toBeVisible();
  await expect(page.getByText("content_json", { exact: true })).toHaveCount(0);
  await expect(page.getByText("prompt_text", { exact: true })).toHaveCount(0);

  await page.goto("/staff");
  await expect(page).toHaveURL("/forbidden");
  await expect(page.getByRole("heading", { name: "权限不足" })).toBeVisible();

  const staffResponse = await page.request.get("/api/admin/admin-users");
  expect(staffResponse.status()).toBe(403);
  expect((await staffResponse.json()).error.code).toBe("admin_permission_denied");

  const response = await page.request.post("/api/admin/characters/char-01/restore");
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("admin_permission_denied");
});

test("admin sees staff management and passes capability enforcement", async ({ page }) => {
  await signIn(page, "admin");
  await openNavigationIfNeeded(page);
  await expect(page.getByRole("link", { name: "后台成员" })).toBeVisible();
  await page.getByRole("link", { name: "后台成员" }).click();
  await expect(page.getByRole("heading", { name: "后台成员" })).toBeVisible();
  await expect(page.getByRole("button", { name: /禁用/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /恢复/ })).toBeVisible();

  const response = await page.request.post("/api/admin/characters/char-01/restore");
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("dependency_unavailable");
});

test("mobile navigation opens without covering the account control", async ({ page }) => {
  await signIn(page, "operator");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("link", { name: "用户订阅" })).toBeVisible();
  await expect(page.getByRole("link", { name: "内容审核" })).toHaveCount(0);
});

test("disabled member state can clear the session and return to login", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/access-denied?code=admin_user_disabled");
  await expect(page.getByRole("heading", { name: "无法访问 Plum 后台" })).toBeVisible();
  await expect(page.getByText("该后台成员已被停用。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出并重新登录" }).click();
  await expect(page).toHaveURL("/login");
});
