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

test("batch candidates open the single-character workbench and return intact", async ({ page }) => {
  await signIn(page);
  await page.goto("/character-factory/multi");
  await page.getByRole("button", { name: /纯文字描述/ }).click();
  await page.getByLabel("主题或角色风格").fill("红楼梦女性角色的现代都市改编");
  await page.getByLabel("角色数量").fill("3");
  await page.getByRole("button", { name: "交给 AI Agent" }).click();

  await expect(page.getByRole("heading", { name: "候选池" })).toBeVisible();
  await page.getByRole("button", { name: "生成 3 个角色" }).click();
  await expect(page.getByRole("heading", { name: "批量任务" })).toBeVisible();
  await page.getByRole("link", { name: /克制的照顾者/ }).click();

  await expect(page).toHaveURL(/\/character-factory\/multi\/batch-[^/]+\/candidate-01/);
  await expect(page.getByRole("heading", { name: /克制的照顾者 · 角色工作台/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "描述修改" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "对话测试" })).toBeVisible();

  await page.getByRole("link", { name: "返回多角色批次" }).click();
  await expect(page).toHaveURL("/character-factory/multi");
  await expect(page.getByRole("heading", { name: "候选池" })).toBeVisible();
  await expect(page.getByRole("link", { name: /克制的照顾者/ })).toBeVisible();
});
