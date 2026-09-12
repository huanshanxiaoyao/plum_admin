import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

async function openNavigationIfNeeded(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 1280) > 820) return;
  await page.getByRole("button", { name: "打开导航" }).click();
}

test("operator can enter the factory and switch generation modes", async ({ page }) => {
  await signIn(page);
  await openNavigationIfNeeded(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "角色工厂" }).click();

  await expect(page).toHaveURL("/character-factory/single");
  await expect(page.getByRole("heading", { name: "角色工厂" })).toBeVisible();
  await expect(page.getByRole("link", { name: "单角色生成" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: /Limited/ })).toContainText("图文提示词禁止成人向内容");

  await page.getByRole("link", { name: "多角色生成" }).click();
  await expect(page).toHaveURL("/character-factory/multi");
  await expect(page.getByRole("heading", { name: "选择创意来源" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Limited/ })).toContainText("图文提示词禁止成人向内容");
  await expect(page.getByRole("button", { name: /竞品 \/ 社媒 URL/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /纯文字描述/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /示例图片 \+ 文字/ })).toBeVisible();

  await page.getByRole("link", { name: "生图工作流" }).click();
  await expect(page).toHaveURL("/character-factory/image");
  await expect(page.getByRole("link", { name: "生图工作流" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "输入创意" })).toBeVisible();
});

test("image workflow confirms prompt, selects a candidate, edits, and finalizes", async ({ page }) => {
  await signIn(page);
  await page.goto("/character-factory/image");
  await page.getByLabel("画面描述").fill("极简陶器角色道具，柔和自然光");
  await page.getByRole("button", { name: "交给 ChatGPT" }).click();

  await expect(page.getByRole("heading", { name: "生成并确认 Prompt" })).toBeVisible();
  await page.getByRole("button", { name: "确认 Prompt" }).click();
  await page.getByRole("button", { name: "生成 4 张候选图" }).click();
  await expect(page.getByRole("button", { name: "选择候选图 1" })).toBeVisible();
  await page.getByRole("button", { name: "选择候选图 1" }).click();
  await page.getByRole("button", { name: "用选中图开始修图" }).click();

  await expect(page.getByRole("heading", { name: "多轮修图" })).toBeVisible();
  await page.getByLabel("本轮修图指令").fill("背景更暖，保持主体比例");
  await page.getByRole("button", { name: "生成新版本" }).click();
  await expect(page.getByRole("button", { name: /v1/ })).toBeVisible();
  await page.getByRole("button", { name: "设为最终图" }).click();
  await expect(page.getByText("v1 已设为最终图")).toBeVisible();
});

test("single generation exposes revision and dialogue as parallel work areas", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/character-factory/single");
  await page.getByLabel("文字描述").fill("都市雨夜里的慢热书店店员");
  await page.getByRole("button", { name: "生成角色" }).click();

  await expect(page.getByRole("heading", { name: "角色草稿" })).toBeVisible();
  const revise = page.getByRole("heading", { name: "描述修改" }).locator("xpath=ancestor::section");
  const dialogue = page.getByRole("heading", { name: "对话测试" }).locator("xpath=ancestor::section");
  await expect(revise).toBeVisible();
  await expect(dialogue).toBeVisible();

  const reviseBox = await revise.boundingBox();
  const dialogueBox = await dialogue.boundingBox();
  expect(reviseBox).not.toBeNull();
  expect(dialogueBox).not.toBeNull();
  if (testInfo.project.name === "desktop-chromium") {
    expect(Math.abs(reviseBox!.y - dialogueBox!.y)).toBeLessThan(4);
    expect(dialogueBox!.x).toBeGreaterThan(reviseBox!.x + reviseBox!.width - 4);
  } else {
    expect(dialogueBox!.y).toBeGreaterThan(reviseBox!.y + reviseBox!.height - 4);
  }

  await revise.getByPlaceholder(/让她更克制/).fill("减少直接解释，用动作表达关心");
  await revise.getByRole("button", { name: "生成修改预览" }).click();
  await expect(revise.getByText(/减少直接解释/)).toBeVisible();
  await revise.getByRole("button", { name: "应用修改" }).click();
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeDisabled();

  await dialogue.getByLabel("输入测试消息").fill("今天不想回家");
  await dialogue.getByRole("button", { name: "发送" }).click();
  await expect(dialogue.getByText("那就再坐一会儿。", { exact: false })).toBeVisible();
});

test("batch candidates show portrait rows and return intact from the workbench", async ({ page }, testInfo) => {
  await page.route("**/api/admin/character-factory/candidates/*/draft/portrait?*", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
  await signIn(page);
  await page.goto("/character-factory/multi");
  await page.getByRole("button", { name: /纯文字描述/ }).click();
  await page.getByLabel("主题或角色风格").fill("红楼梦女性角色的现代都市改编");
  await page.getByLabel("角色数量").fill("5");
  await page.getByRole("button", { name: "交给 AI Agent" }).click();

  await expect(page.getByRole("heading", { name: "候选池" })).toBeVisible();
  await page.getByRole("button", { name: "生成 5 个角色" }).click();
  const batch = page.getByRole("heading", { name: "批量任务" }).locator("xpath=ancestor::section");
  await expect(batch).toBeVisible();
  await expect(batch.getByRole("link")).toHaveCount(4);
  await expect(batch.getByText("生成失败 · 可单独重试")).toBeVisible();
  await batch.getByRole("button", { name: "仅重试失败项" }).click();

  const rows = batch.getByRole("link");
  await expect(rows).toHaveCount(5);
  for (const row of await rows.all()) {
    const portrait = row.getByRole("img");
    await portrait.scrollIntoViewIfNeeded();
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  }
  const layout = await rows.evaluateAll((elements) => elements.map((element) => ({
    row: element.getBoundingClientRect().toJSON(),
    container: element.parentElement!.getBoundingClientRect().toJSON(),
    portrait: element.querySelector("img")!.getBoundingClientRect().toJSON(),
    title: element.querySelector("strong")!.getBoundingClientRect().toJSON(),
    fits: element.scrollWidth <= element.clientWidth,
  })));
  for (const [index, item] of layout.entries()) {
    expect(Math.abs(item.row.width - item.container.width)).toBeLessThan(3);
    expect(item.portrait.width).toBeGreaterThan(40);
    expect(item.portrait.right).toBeLessThanOrEqual(item.title.x);
    expect(item.portrait.x).toBeGreaterThanOrEqual(item.row.x);
    expect(item.fits).toBe(true);
    if (index > 0) expect(item.row.y).toBeGreaterThanOrEqual(layout[index - 1].row.bottom);
  }
  await batch.screenshot({ path: testInfo.outputPath("batch-portrait-rows.png") });
  await batch.getByRole("link", { name: /克制的照顾者/ }).click();

  await expect(page).toHaveURL(/\/character-factory\/multi\/batch-[^/]+\/candidate-01/);
  await expect(page.getByRole("heading", { name: /克制的照顾者 · 角色工作台/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "描述修改" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "对话测试" })).toBeVisible();

  await page.getByRole("link", { name: "返回多角色批次" }).click();
  await expect(page).toHaveURL("/character-factory/multi");
  await expect(page.getByRole("heading", { name: "候选池" })).toBeVisible();
  await expect(rows).toHaveCount(5);
  await expect(batch.getByRole("link", { name: /克制的照顾者/ }).getByRole("img")).toBeVisible();
});

test("batch source previews all five local images before upload", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/character-factory/multi");
  await page.getByRole("button", { name: /示例图片 \+ 文字/ }).click();
  const files = await page.evaluate(() => Array.from({ length: 5 }, (_, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = ["#397c69", "#b75165", "#567da6", "#967738", "#765d98"][index];
    context.fillRect(0, 0, 120, 160);
    context.fillStyle = "#ffffff";
    context.font = "48px sans-serif";
    context.fillText(String(index + 1), 45, 95);
    return { name: `reference-${index + 1}.png`, data: canvas.toDataURL("image/png").split(",")[1] };
  }));
  const upload = page.getByLabel("选择示例图片");
  await upload.setInputFiles(files.map((file) => ({ name: file.name, mimeType: "image/png", buffer: Buffer.from(file.data, "base64") })));
  const previews = page.getByLabel("已选择的示例图片");
  await expect(previews.getByRole("img")).toHaveCount(5);
  for (const file of files) {
    const image = previews.getByRole("img", { name: file.name, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 120)).toBe(true);
  }
  expect(await previews.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await previews.screenshot({ path: testInfo.outputPath("batch-source-previews.png") });
  await page.getByRole("button", { name: /纯文字描述/ }).click();
  await page.getByRole("button", { name: /示例图片 \+ 文字/ }).click();
  await expect(previews.getByRole("img")).toHaveCount(5);
  await previews.getByRole("button", { name: "移除 reference-3.png" }).click();
  await expect(previews.getByRole("img")).toHaveCount(4);
  await expect(previews.getByRole("img", { name: "reference-3.png" })).toHaveCount(0);
  await expect(page.getByText("已选择 4 张图片")).toBeVisible();
  await upload.setInputFiles([{ name: "replacement.png", mimeType: "image/png", buffer: Buffer.from(files[0].data, "base64") }]);
  await expect(previews.getByRole("img")).toHaveCount(1);
  await expect(previews.getByRole("img", { name: "replacement.png" })).toBeVisible();
});
