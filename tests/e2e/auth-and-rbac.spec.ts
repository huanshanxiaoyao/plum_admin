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
  await expect(page.getByRole("link", { name: "后台成员" })).toBeVisible();

  await page.getByRole("link", { name: "角色管理" }).click();
  await expect(page.getByRole("heading", { name: "角色管理" })).toBeVisible();
  await expect(page.getByText("Ada", { exact: true })).toBeVisible();
  await expect(page.getByText("Ember", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Ember");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/q=Ember/);
  await expect(page.getByText("Ember", { exact: true })).toBeVisible();
  await expect(page.getByText("Ada", { exact: true })).toHaveCount(0);

  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "后台成员" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Jack ou_accept_admin/ })).toBeVisible();
  await expect(page.getByText("只读", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: /禁用/ })).toHaveCount(0);

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
