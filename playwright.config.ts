import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // 默认 30s 对本套件太紧：RBAC 那条用例要走近二十次跳转，而 dev server 是按需编译路由的，
  // 四路并行时单独跑 16s 的用例会摸到 30s。CI 有 retries=2 一直替它兜着，本地没有。
  timeout: 60_000,
  outputDir: ".artifacts/playwright/test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/api/health",
    reuseExistingServer: false,
    env: {
      PLAYWRIGHT_TEST: "1",
      ADMIN_AUTH_MODE: "mock",
      ADMIN_SESSION_SECRET: "e2e-session-secret-at-least-32-characters",
      ADMIN_DATA_SOURCE: "fixture",
      ADMIN_API_WRITE_ENABLED: "true",
      PROJECT_DOCUMENTS_DIR: ".artifacts/playwright/project-documents",
      ADMIN_EVAL_REPORTS_DIR: "tests/fixtures/eval-reports",
      // 固定保留期，否则「还剩几天」的断言会随默认值改动而漂。
      ADMIN_EVAL_INSPECT_RETENTION_DAYS: "3650",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
