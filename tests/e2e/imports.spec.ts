import { expect, test } from "@playwright/test";
import { buildZip } from "../helpers/zip-fixture.ts";

const FIXTURE_BATCH_ID = "0f3d1a2b3c4d5e6f7a8b9c0d1e2f3a4b";

const PORTRAIT_PATH = "images/001_luna.png";

/** 真的 1x1 PNG。用假字节的话 <img> 解不出像素，缩略图这条就只验到了 DOM 里有个空框。 */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const MANIFEST = [
  "row_key,display_name,gender,intro,opening_scene,character_settings,creator_declared_rating,portrait_file",
  `001_luna,露娜,female,月之城的守夜人,你在城墙下遇见她,冷静寡言,general,${PORTRAIT_PATH}`,
  "",
].join("\n");

/** 和单测共用同一个手拼夹具：这里要走的正是浏览器里那条真实的解包路径。 */
async function packageBytes(): Promise<Buffer> {
  const zip = buildZip([
    { name: "manifest.csv", data: Buffer.from(MANIFEST, "utf8") },
    { name: PORTRAIT_PATH, data: PNG_1X1 },
  ]);
  return Buffer.from(await zip.arrayBuffer());
}

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
  await expect(page.getByRole("link", { name: "打包规范" })).toBeVisible();
  await expect(page.getByRole("link", { name: "使用说明" })).toBeVisible();
});

test("operator can open both import documents from the console", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports");

  await page.getByRole("link", { name: "打包规范" }).click();
  await expect(page).toHaveURL("/imports/package-guide");
  await expect(page.getByRole("heading", { name: "角色导入打包规范" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下载 CSV 模板" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("character_id");
  await expect(page.getByText("第 61 行起显示文件名")).toBeVisible();

  await page.getByRole("link", { name: "返回角色导入" }).click();
  await page.getByRole("link", { name: "使用说明" }).click();
  await expect(page).toHaveURL("/imports/user-guide");
  await expect(page.getByRole("heading", { name: "角色导入使用说明" })).toBeVisible();
  await expect(page.getByText("生产导入会真实创建或更新角色，且没有批次回滚。")).toBeVisible();
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

test("角色管理页把批量导入放在动机出现的地方", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/characters");
  // 同样不用 goto：运营是在看角色列表时才想到"这批要批量加"，入口必须在那一页点得到。
  await page.getByRole("link", { name: "批量导入" }).click();
  await expect(page).toHaveURL("/imports");
  await expect(page.getByRole("heading", { name: "角色导入" })).toBeVisible();
});

test("选完包就能看见立绘缩略图，不用等结果页", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports");

  const file = {
    name: "plum-import.zip",
    mimeType: "application/zip",
    buffer: await packageBytes(),
  };
  const preflight = page.getByRole("region", { name: "预检结果" });
  // 选包的 onChange 挂在客户端组件上，hydration 完成前投进去的文件会掉在地上。
  // 与其 sleep 一个猜出来的秒数，不如重投到界面真的开始解包为止。
  await expect
    .poll(async () => {
      await page.locator('input[type="file"]').setInputFiles(file);
      return preflight.count();
    })
    .toBeGreaterThan(0);

  await expect(preflight).toContainText("露娜");

  // 配错图是合法的——预检和机审都拦不住，只有人看得出来。所以图必须在提交前出现。
  const thumbnail = preflight.getByRole("img", { name: `立绘预览：${PORTRAIT_PATH}` });
  await expect(thumbnail).toBeVisible();
  await thumbnail.scrollIntoViewIfNeeded();
  // 只判断 <img> 在不在等于没测：blob URL 撤早了照样是个空框。要它真解出了像素。
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});

test("跑完一批还能从台账找回来，并且写明没有回滚", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/imports");

  await page.getByRole("link", { name: "全部批次" }).click();
  await expect(page).toHaveURL("/imports/batches");
  await expect(page.getByRole("heading", { name: "导入历史" })).toBeVisible();

  // 台账是唯一的事后补救入口，"没有回滚"必须写在这里。
  await expect(page.getByText("导入不提供批次回滚。")).toBeVisible();

  const ledger = page.getByRole("region", { name: "导入批次台账" });
  // 仍在跑的批次计数不齐，要写明白差多少行，否则会被当成漏了行。
  await expect(ledger).toContainText("进行中");
  await expect(ledger).toContainText("7 行处理中");

  // 只有三批，翻页到头：两个方向都必须是禁用按钮，而不是点了没反应的链接。
  await expect(page.getByRole("button", { name: "上一页" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下一页" })).toBeDisabled();

  // 列出来却点不进去等于没做——这一条挡的就是那种半成品。
  await ledger.locator(`a[href="/imports/${FIXTURE_BATCH_ID}"]`).click();
  await expect(page).toHaveURL(`/imports/${FIXTURE_BATCH_ID}`);
  await expect(page.getByRole("heading", { name: "导入结果" })).toBeVisible();
});
