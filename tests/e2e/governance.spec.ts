import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, role: "Admin" | "Operator") {
  await page.goto("/login");
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

test("membership controls respect administrator permission and current status", async ({ page }) => {
  await signIn(page, "Operator");
  await page.goto("/users/pusr_accept_member_free");
  await expect(page.getByText("当前账号没有此操作权限。")).toBeVisible();
  await expect(page.getByRole("button", { name: "封禁用户", exact: true })).toBeDisabled();
  const denied = await page.request.patch("/api/admin/users/pusr_accept_member_free/membership", {
    data: { status: "disabled", expected_status: "active", reason: "permission check" },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("admin_permission_denied");

  await page.context().clearCookies();
  await signIn(page, "Admin");
  await page.goto("/users/pusr_accept_member_disabled");
  await expect(page.getByRole("button", { name: "解除封禁" })).toBeDisabled();
  await expect(page.getByText("当前为演示数据，暂不可修改。")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("user-governance.png"), fullPage: true, caret: "initial" });
});

test("character and published work expose current rating with read-only fixture protection", async ({ page }) => {
  await signIn(page, "Operator");
  await page.goto("/characters/char_accept_ugc_mature");
  await expect(page.getByRole("combobox", { name: "内容分级" })).toHaveValue("mature");
  await expect(page.getByRole("button", { name: "保存分级" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "操作原因" })).toHaveAttribute("required", "");
  await page.screenshot({ path: test.info().outputPath("character-governance.png"), fullPage: true, caret: "initial" });
  const workLink = page.locator("a[href^='/works/']");
  await workLink.click();
  await expect(page.getByRole("combobox", { name: "内容分级" })).toHaveValue("mature");
  await expect(page.getByRole("button", { name: "保存分级" })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
