import { expect, test } from "@playwright/test";

function section(page: import("@playwright/test").Page, heading: string) {
  return page.getByRole("region", { name: heading });
}

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
  // 角色详情现在有两个治理表单（分级、下架与恢复），控件按区块限定，否则 strict mode 直接判违例。
  await expect(section(page, "修改当前版本分级").getByRole("textbox", { name: "操作原因" })).toHaveAttribute("required", "");
  await page.screenshot({ path: test.info().outputPath("character-governance.png"), fullPage: true, caret: "initial" });
  const workLink = page.locator("a[href^='/works/']");
  await workLink.click();
  await expect(page.getByRole("combobox", { name: "内容分级" })).toHaveValue("mature");
  await expect(page.getByRole("button", { name: "保存分级" })).toBeDisabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("takedown and restore entries follow character status and the admin-only restore capability", async ({ page }) => {
  await signIn(page, "Operator");
  // active 角色只出现下架入口；Operator 有 operations.access，按钮禁用只因为演示数据是只读的。
  await page.goto("/characters/char_accept_ugc_general");
  const active = section(page, "下架与恢复");
  await expect(active.getByRole("button", { name: "下架角色" })).toBeDisabled();
  await expect(active.getByRole("button", { name: "恢复上架" })).toHaveCount(0);
  await expect(active.getByRole("combobox", { name: "原因码" })).toHaveValue("rights_complaint");
  await expect(active.getByText("当前为演示数据，暂不可修改。")).toBeVisible();

  // 已下架角色反过来：只有恢复入口，而 Operator 没有 character.restore，看到的是权限说明。
  await page.goto("/characters/char_accept_ugc_takedown");
  const takenDown = section(page, "下架与恢复");
  await expect(takenDown.getByRole("button", { name: "下架角色" })).toHaveCount(0);
  await expect(takenDown.getByRole("button", { name: "恢复上架" })).toBeDisabled();
  await expect(takenDown.getByText("当前账号没有此操作权限。")).toBeVisible();
  // 入口裁剪只是提示，真正的闸门在 BFF：直连同一条路径必须同样被拒。
  const denied = await page.request.post("/api/admin/characters/char_accept_ugc_takedown/restore", {
    data: { reason_code: "appeal_accepted", reason: "permission check" },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("admin_permission_denied");

  await page.context().clearCookies();
  await signIn(page, "Admin");
  await page.goto("/characters/char_accept_ugc_takedown");
  const asAdmin = section(page, "下架与恢复");
  await expect(asAdmin.getByRole("combobox", { name: "原因码" })).toHaveValue("appeal_accepted");
  await expect(asAdmin.getByRole("button", { name: "恢复上架" })).toBeDisabled();
  await expect(asAdmin.getByText("当前为演示数据，暂不可修改。")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("character-takedown.png"), fullPage: true, caret: "initial" });
});
