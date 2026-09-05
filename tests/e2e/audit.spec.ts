import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, role: "operator" | "admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: role === "admin" ? "Admin" : "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

async function openNavigationIfNeeded(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 1280) > 820) return;
  await page.getByRole("button", { name: "打开导航" }).click();
}

test("admin 能翻开账本，导入与复核处置都在里面", async ({ page }) => {
  await signIn(page, "admin");
  await openNavigationIfNeeded(page);
  await page.getByRole("link", { name: "操作审计" }).click();
  await expect(page).toHaveURL("/audit");
  await expect(page.getByRole("heading", { name: "操作审计" })).toBeVisible();

  // 动作名同时出现在筛选下拉里，断言必须锁在表格上，否则下拉一直「可见」，筛没筛都测不出来。
  const ledger = page.getByLabel("操作审计列表");

  // 两类写操作都要留得下账：这一页存在的理由就是这个。
  await expect(ledger.getByText("发起批量导入", { exact: true })).toBeVisible();
  await expect(ledger.getByText("复核·清除", { exact: true })).toBeVisible();
  // 明文读取要一眼看见。
  await expect(ledger.getByText("明文", { exact: true })).toBeVisible();
  // 操作者、资源与改动字段名都在；角色正文不在。
  await expect(ledger.getByText("林运营", { exact: true }).first()).toBeVisible();
  await expect(ledger.getByText("display_name / opening_scene", { exact: true })).toBeVisible();
  await expect(ledger.getByText("已注销", { exact: true })).toBeVisible();

  await page.getByRole("combobox").selectOption("plum_moderation.purge");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/status=plum_moderation\.purge/);
  await expect(ledger.getByText("复核·清除", { exact: true })).toBeVisible();
  await expect(ledger.getByText("发起批量导入", { exact: true })).toHaveCount(0);
});

test("operator 看不到审计入口，直连接口也拿不到", async ({ page }) => {
  await signIn(page, "operator");
  await openNavigationIfNeeded(page);
  await expect(page.getByRole("link", { name: "操作审计" })).toHaveCount(0);

  await page.goto("/audit");
  await expect(page).toHaveURL("/forbidden");

  // 入口藏起来但接口放行，等于没做权限。
  const response = await page.request.get("/api/admin/audit-events");
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("admin_permission_denied");
});
