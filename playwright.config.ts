import { defineConfig, devices } from "@playwright/test"

const port = 3107
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // A single production server is intentionally exercised sequentially. This avoids
  // platform-specific load-event contention and keeps mocked scenarios isolated.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "e2e/report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      APP_ENV: "dev",
      APP_ORIGIN: baseURL,
      SESSION_SECRET: "playwright-local-session-secret-00000000",
      AUTH_ISSUER: "https://identity.example.test/",
      AUTH_AUDIENCE: "debate-analyser-e2e",
      AUTH_JWKS_URL: "https://identity.example.test/.well-known/jwks.json",
      AUTH_CLIENT_ID: "debate-analyser-e2e-client",
      AUTH_CLIENT_SECRET: "playwright-e2e-client-secret-not-for-production",
      LEGAL_ALLOW_UPLOADS: "false",
      LEGAL_ALLOW_PASTE: "false",
      PUBLIC_SHARING_ENABLED: "false",
      REPORT_EXPORT_ENABLED: "false",
      ACCOUNT_DATA_EXPORT_ENABLED: "false",
    },
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
})
