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
  await expect(page.getByText("5", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("近 7 日更新 Work")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看角色" })).toBeVisible();
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

  await openNavigationIfNeeded(page);
  await page.getByRole("link", { name: "用户", exact: true }).click();
  await expect(page.getByRole("heading", { name: "用户", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Rowan", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Jules");
  await page.getByLabel("Membership 状态").selectOption("disabled");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page).toHaveURL(/q=Jules/);
  await expect(page.getByRole("link", { name: "Jules", exact: true })).toBeVisible();
  await expect(page.getByText("j***@users.invalid", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Jules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jules", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "身份与 Membership" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "公开资料与创作" })).toBeVisible();
  await expect(page.locator("main").getByText("Subscription", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByText("Wallet", { exact: true })).toHaveCount(0);
  await expect(page.locator("main").getByText(/@users\.invalid/, { exact: false })).toHaveText(/\*\*\*@users\.invalid/);

  await page.goto("/staff");
  await expect(page).toHaveURL("/forbidden");
  await expect(page.getByRole("heading", { name: "权限不足" })).toBeVisible();

  const staffResponse = await page.request.get("/api/admin/admin-users");
  expect(staffResponse.status()).toBe(403);
  expect((await staffResponse.json()).error.code).toBe("admin_permission_denied");

  // 探针要挑一条**没有**放行的角色子操作：`restore` 曾经担任这个角色，等它真的上线之后
  // 这条断言就从「未放行」悄悄变成「远端不可达」。`archive` 目前不在白名单里。
  const response = await page.request.post("/api/admin/characters/char-01/archive");
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("resource_not_found");
});

test("admin sees staff management and passes capability enforcement", async ({ page }) => {
  await signIn(page, "admin");
  await openNavigationIfNeeded(page);
  await expect(page.getByRole("link", { name: "后台成员" })).toBeVisible();
  await page.getByRole("link", { name: "后台成员" }).click();
  await expect(page.getByRole("heading", { name: "后台成员" })).toBeVisible();
  await expect(page.getByRole("button", { name: /禁用/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /恢复/ })).toBeVisible();

  // 探针要挑一条**没有**放行的角色子操作：`restore` 曾经担任这个角色，等它真的上线之后
  // 这条断言就从「未放行」悄悄变成「远端不可达」。`archive` 目前不在白名单里。
  const response = await page.request.post("/api/admin/characters/char-01/archive");
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("resource_not_found");
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

test("project documents are admin-uploaded and rendered without executing HTML scripts", async ({ page }, testInfo) => {
  await signIn(page, "admin");
  await page.goto("/mydocs");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const htmlTitle = `HTML 渲染 ${suffix}`;
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeEnabled();
  await fileInput.setInputFiles({
    name: `render-${suffix}.html`,
    mimeType: "text/html",
    buffer: Buffer.from(`<!doctype html>
      <html><head><style>body{font-family:sans-serif}#proof{color:rgb(32,122,77)}</style></head>
      <body><h1 id="proof">HTML 内容已渲染</h1>
      <script>parent.document.body.dataset.uploadCompromised="true";document.body.dataset.scriptRan="true"</script>
      </body></html>`),
  });
  await page.getByLabel("文档标题").fill(htmlTitle);
  await page.getByRole("button", { name: "上传", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已上传");
  await page.getByRole("link", { name: new RegExp(htmlTitle) }).click();

  const frame = page.frameLocator(`iframe[title="${htmlTitle}"]`);
  await expect(frame.getByRole("heading", { name: "HTML 内容已渲染" })).toBeVisible();
  expect(await frame.locator("#proof").evaluate((node) => getComputedStyle(node).color)).toBe("rgb(32, 122, 77)");
  await expect(frame.locator("body")).not.toHaveAttribute("data-script-ran");
  await expect(page.locator("body")).not.toHaveAttribute("data-upload-compromised");

  await page.goto("/mydocs");
  const markdownTitle = `Markdown 渲染 ${suffix}`;
  const nextFileInput = page.locator('input[type="file"]');
  await expect(nextFileInput).toBeEnabled();
  await nextFileInput.setInputFiles({
    name: `guide-${suffix}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from("# Markdown 内容已渲染\n\n| 项目 | 状态 |\n| --- | --- |\n| HTML | 正常 |\n\n<script>document.body.dataset.uploadCompromised='true'</script>"),
  });
  await page.getByLabel("文档标题").fill(markdownTitle);
  await page.getByRole("button", { name: "上传", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(markdownTitle) }).click();
  await expect(page.getByRole("heading", { name: "Markdown 内容已渲染" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("article").locator("script")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-upload-compromised");
});

test("operators can read project docs but cannot upload them", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/mydocs");
  await expect(page.getByRole("heading", { name: "项目文档" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上传", exact: true })).toHaveCount(0);

  const response = await page.request.post("/api/mydocs", {
    headers: { Origin: "http://127.0.0.1:3101" },
    multipart: {
      title: "越权文档",
      file: { name: "blocked.md", mimeType: "text/markdown", buffer: Buffer.from("blocked") },
    },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("admin_permission_denied");
});
