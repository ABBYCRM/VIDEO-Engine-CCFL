import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    // GitHub Actions sets HOSTNAME to the runner name. Next standalone
    // binds to that host, so Playwright's 127.0.0.1:3000 poll never connects.
    // NODE_ENV=test on the verify job also keeps the production server from
    // serving the standalone build. Force loopback + production for CI.
    command: process.env.CI
      ? "mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public && HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production node .next/standalone/server.js"
      : "npm run dev",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe"
  }
});
