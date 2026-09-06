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
    // CI: production `next start` on loopback. Do not poll /login — that
    // route was removed in the Claw-only strip (not-found redirects to
    // /claw). Playwright treats HTTP 404 as "not ready" (status < 404),
    // so a 404 health URL hangs until webServer.timeout.
    command: process.env.CI ? "bash scripts/e2e-webserver.sh" : "npm run dev",
    url: "http://127.0.0.1:3000/api/ready",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe"
  }
});
