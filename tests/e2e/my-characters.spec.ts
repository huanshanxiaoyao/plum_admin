import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

test("我的角色支持多账号绑定、统计切换与批量调整范围预览", async ({ page }) => {
  await signIn(page);
  await page.goto("/characters?view=mine");

  await expect(page.getByRole("link", { name: "我的角色" })).toHaveClass(/activeTab/);
  await expect(page.getByRole("heading", { name: "绑定创作者账号" })).toBeVisible();

  await page.getByLabel("Plum 用户 ID").fill("pusr_accept_creator_active");
  await page.getByRole("button", { name: "校验并绑定" }).click();
  await expect(page.getByLabel("当前创作者账号")).toHaveValue("pusr_accept_creator_active");
  await expect(page.getByRole("link", { name: "Sol", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ione", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "统计" }).click();
  await expect(page.getByText("2,480", { exact: true })).toBeVisible();
  await expect(page.getByText("连接、曝光和点击暂无数据时留空。")).toBeVisible();

  await page.getByLabel("选择 Sol").check();
  await page.getByLabel("选择 Vale").check();
  await page.getByLabel("角色调整需求").fill("增加一个设定：内心希望得到他人认可。 ");
  await page.getByRole("button", { name: "生成调整预览" }).click();
  const preview = page.getByRole("status");
  await expect(preview).toContainText("Sol、Vale");
  await expect(preview).toContainText("当前尚未修改线上角色");

  await page.getByRole("button", { name: "管理绑定" }).click();
  await page.getByLabel("Plum 用户 ID").fill("pusr_accept_official");
  await page.getByRole("button", { name: "校验并绑定" }).click();
  await expect(page.getByLabel("当前创作者账号")).toHaveValue("pusr_accept_official");
  await expect(page.getByRole("link", { name: "Ada", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("当前创作者账号")).toHaveValue("pusr_accept_creator_active");
  await expect(page.getByRole("link", { name: "Sol", exact: true })).toBeVisible();
});
