import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Operator" }).click();
  await page.getByRole("button", { name: "进入管理后台" }).click();
  await expect(page).toHaveURL("/");
}

test("active user detail shows wallet totals, expiry lots and bounded recharge fields", async ({ page }) => {
  await signIn(page);
  await page.goto("/users/pusr_accept_member_free");

  await expect(page.getByRole("heading", { name: "水晶钱包" })).toBeVisible();
  await expect(page.getByText("405 水晶", { exact: true })).toBeVisible();
  await expect(page.getByText("2026/09/30 20:00 到期", { exact: true })).toBeVisible();

  const amount = page.getByRole("spinbutton", { name: "充值数量" });
  const validity = page.getByRole("spinbutton", { name: "有效期" });
  await expect(amount).toHaveValue("");
  await expect(amount).toHaveAttribute("min", "1");
  await expect(amount).toHaveAttribute("max", "5000");
  await expect(validity).toHaveValue("30");
  await expect(validity).toHaveAttribute("min", "1");
  await expect(validity).toHaveAttribute("max", "90");
  await expect(page.getByRole("textbox", { name: "充值原因" })).toHaveAttribute("required", "");

  await expect(page.getByText("当前是 fixture 数据源，人工充值不可用。")).toBeVisible();
  await expect(page.getByRole("button", { name: "确认充值" })).toBeDisabled();
});

test("disabled member has no wallet or recharge controls", async ({ page }) => {
  await signIn(page);
  await page.goto("/users/pusr_accept_member_disabled");

  await expect(page.getByRole("heading", { name: "水晶钱包" })).toBeVisible();
  await expect(page.getByText("Membership 已禁用，不能查询钱包或充值。")).toBeVisible();
  await expect(page.getByRole("button", { name: "确认充值" })).toHaveCount(0);
});

test("wallet proxy permits only the two shipped routes", async ({ page }) => {
  await signIn(page);
  const wallet = await page.request.get("/api/admin/users/pusr_accept_member_free/wallet");
  expect(wallet.status()).toBe(503);
  expect((await wallet.json()).error.code).toBe("dependency_unavailable");

  const grant = await page.request.post("/api/admin/users/pusr_accept_member_free/wallet/grants", {
    headers: { "Idempotency-Key": "wallet-proxy-accept-001" },
    data: { amount: 1, validity_days: 30, reason: "proxy allowlist check" },
  });
  expect(grant.status()).toBe(503);
  expect((await grant.json()).error.code).toBe("dependency_unavailable");

  const neighbour = await page.request.post("/api/admin/users/pusr_accept_member_free/wallet/grants/extra");
  expect(neighbour.status()).toBe(404);
  expect((await neighbour.json()).error.code).toBe("resource_not_found");
});
