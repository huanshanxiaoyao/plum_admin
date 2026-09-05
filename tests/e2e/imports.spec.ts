import { expect, test } from "@playwright/test";

const FIXTURE_BATCH_ID = "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b";

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

test("operator reaches the import console from daily navigation", async ({ page }) => {
  await signIn(page, "operator");
  // 直接 goto 过不了这一条：入口必须在导航里点得到。功能做完了但没注册进导航，
  // 线上就是"接口能用、网页上找不到"——这条测试挡的就是那个状态。
  await openNavigationIfNeeded(page);
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: "角色导入" }).click();
  await expect(page).toHaveURL("/imports");
  await expect(page.getByRole("heading", { name: "角色导入" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下载 CSV 模板" })).toBeVisible();
});

test("packaging rules are rendered from the schema instead of hand-written copy", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports");
  const spec = page.getByRole("region", { name: "打包要点" });
  await expect(spec).toContainText("不接受");
  await expect(spec).toContainText(".xlsx");
  await expect(spec).toContainText("单包最多 100 个角色");
  await expect(spec).toContainText("标签最多 10 个");
});

test("fixture data source disables submission instead of failing on submit", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports");
  await expect(page.getByText("当前是 fixture 数据源，导入不可用。")).toBeVisible();
  // 选包本身仍然可用：本地解包与校验不需要后端。
  await expect(page.getByRole("button", { name: "选择文件" })).toBeEnabled();
});

test("result page separates pending review from outright failure", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto(`/imports/${FIXTURE_BATCH_ID}`);
  await expect(page.getByRole("heading", { name: "导入结果" })).toBeVisible();

  const summary = page.getByLabel("结果汇总");
  await expect(summary).toContainText("已发布");
  await expect(summary).toContainText("待复核");

  // 「待复核不是失败」这句必须在页面上，否则运营会以为这批白干了。
  await expect(page.getByText("待复核不是失败。")).toBeVisible();
  await expect(page.getByRole("link", { name: /前往内容复核/ })).toBeVisible();
});

test("result rows link successful characters and explain failed ones", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto(`/imports/${FIXTURE_BATCH_ID}`);
  const rows = page.getByRole("region", { name: "逐行结果" });

  await expect(rows.getByRole("link", { name: "char_7d21a4" })).toHaveAttribute(
    "href",
    "/characters/char_7d21a4",
  );
  await expect(rows).toContainText("revision_conflict");
  await expect(rows).toContainText("请重新预检再提交，不要直接重试");
});

test("result manifest can be exported and carries no character text", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto(`/imports/${FIXTURE_BATCH_ID}`);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出结果清单" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("plum_import_result_0f3d1a2b3c4d.csv");

  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");

  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("row_key,character_id,owner_platform_user_id,operation,status");
  expect(csv).toContain("001_luna");
  // 隐私边界：导出只含标识与状态，正文列一个都不能有。
  for (const forbidden of ["intro", "opening_scene", "character_settings", "display_name"]) {
    expect(csv).not.toContain(forbidden);
  }
});

test("unknown batch ids render the not-found page instead of an empty result", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports/does-not-exist");
  // 这个 Next 版本下 notFound() 走流式渲染，HTTP 状态已提交为 200（/moderation/:id 与
  // /characters/:id 同样如此），所以判据是渲染出来的界面，不是状态码。
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(page.getByRole("region", { name: "逐行结果" })).toHaveCount(0);
});
