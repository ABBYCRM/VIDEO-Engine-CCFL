import type { Page } from "@playwright/test";

export async function stubAuthenticatedSession(page: Page) {
  await page.route("**/api/admin/session", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true }) });
  });
}

export async function openNavigationIfNeeded(page: Page) {
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
}
