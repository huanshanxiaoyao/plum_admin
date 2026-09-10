import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, role: "operator" | "admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: role === "admin" ? "Admin" : "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

function isMobile(page: import("@playwright/test").Page) {
  return (page.viewportSize()?.width ?? 1280) <= 820;
}

async function openNavigationIfNeeded(page: import("@playwright/test").Page) {
  if (!isMobile(page)) return;
  await page.getByRole("button", { name: "打开导航" }).click();
}

async function closeNavigationIfNeeded(page: import("@playwright/test").Page) {
  if (!isMobile(page)) return;
  // 抽屉开着时遮罩会吃掉页面上的点击，而次级入口在页面底部、不在抽屉里。
  // 抽屉里的关闭按钮与遮罩共用同一个 aria-label，因此要限定在侧栏内取。
  await page.getByRole("complementary").getByRole("button", { name: "关闭导航" }).click();
}

test("admin 从页面底部的次级入口进评测报告，主导航里没有它", async ({ page }) => {
  await signIn(page, "admin");
  await openNavigationIfNeeded(page);
  // 评测不是运营能力，因此不在主导航里；入口只在页面底部。
  await expect(page.getByRole("navigation", { name: "主导航" }).getByText("评测")).toHaveCount(0);
  await closeNavigationIfNeeded(page);
  await page.getByRole("link", { name: "记忆评测报告 →" }).click();
  await expect(page).toHaveURL("/eval");
  await expect(page.getByRole("heading", { name: "记忆评测" })).toBeVisible();
  // 按行断言：两类产物列在同一张表里，findings 徽章会重名。
  const trajectoryRow = page.getByRole("row").filter({ hasText: "e2e-reference" });
  await expect(trajectoryRow.getByRole("link", { name: "e2e-reference" })).toBeVisible();
  await expect(trajectoryRow).toContainText("mem-reference-001");
  await expect(trajectoryRow).toContainText("模式 C · 全真实");
  await expect(trajectoryRow).toContainText("high 1");
  // manifest 里是 ISO 时刻，列表按 UTC 定点渲染，不跟随浏览器时区。
  await expect(trajectoryRow).toContainText("2026-08-31 23:58 UTC");
  // 轨迹跑的是合成对话，不该出现过期提示。
  await expect(trajectoryRow).not.toContainText("含真实用户正文");

  // 只读诊断必须一眼能看出它含真实用户正文、且会过期。
  const inspectRow = page.getByRole("row").filter({ hasText: "conn_e2e-20260901T000000Z" });
  await expect(inspectRow).toContainText("只读诊断");
  await expect(inspectRow).toContainText("conn_e2e");
  await expect(inspectRow).toContainText("不调模型");
  await expect(inspectRow).toContainText(/含真实用户正文 · \d+ 天后清除/);
  // 独立页面不套后台外壳，因此自己负责回去的路。
  await page.getByRole("link", { name: "返回 Plum 后台" }).click();
  await expect(page).toHaveURL("/");
});

test("报告在自己的 CSP 沙箱里打开，拿不到后台的同源身份", async ({ page }) => {
  await signIn(page, "admin");
  const response = await page.goto("/eval/e2e-reference");
  expect(response?.status()).toBe(200);

  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("sandbox allow-scripts");
  expect(policy).toContain("default-src 'none'");
  expect(response?.headers()["cache-control"]).toBe("no-store");

  // 沙箱不带 allow-same-origin，文档因此落在不透明源里：脚本能跑，但碰不到后台会话。
  await expect(page.getByText("origin=null")).toBeVisible();
});

test("operator 看不到入口，直连报告也拿不到", async ({ page }) => {
  await signIn(page, "operator");
  await expect(page.getByRole("link", { name: "记忆评测报告 →" })).toHaveCount(0);

  await page.goto("/eval");
  await expect(page).toHaveURL("/forbidden");

  const denied = await page.request.get("/eval/e2e-reference");
  expect(denied.status()).toBe(403);
});

test("未登录读报告是 401，不是把正文发出去", async ({ page }) => {
  const anonymous = await page.request.get("/eval/e2e-reference");
  expect(anonymous.status()).toBe(401);
});

test("诊断正文用自己的文件名，同样走沙箱", async ({ page }) => {
  await signIn(page, "admin");
  const response = await page.goto("/eval/conn_e2e-20260901T000000Z");
  expect(response?.status()).toBe(200);
  // 发布端不改名（inspection.html），查看端两个名字都认。
  await expect(page.getByRole("heading", { name: "记忆诊断 · conn_e2e" })).toBeVisible();
  expect(response?.headers()["content-security-policy"] ?? "").toContain("sandbox allow-scripts");
  expect(response?.headers()["cache-control"]).toBe("no-store");
});

test("不存在的运行与越界的 run id 都是 404", async ({ page }) => {
  await signIn(page, "admin");
  expect((await page.request.get("/eval/missing-run")).status()).toBe(404);
  expect((await page.request.get("/eval/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd")).status()).toBe(404);
});
