import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
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
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
