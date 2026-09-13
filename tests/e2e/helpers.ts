import type { Page } from "@playwright/test";

/** No-op. The console has no login wall. Kept so existing e2e imports stay valid. */
export async function stubAuthenticatedSession(_page: Page) {}

export async function openNavigationIfNeeded(page: Page) {
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible().catch(() => false)) await toggle.click();
}
