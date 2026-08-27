import { test, expect } from "@playwright/test";

/** Captures a screenshot of the Calendar with the redirect banner. */
test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("calendar renders the disabled-image-gen banner when redirected", async ({ page, request }) => {
  test.setTimeout(60000);
  const login = await request.post("/api/admin/login", { data: { password: "1234" }, ignoreHTTPSErrors: true });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  // Visit the page as if we just clicked a deep link to /avatars
  await page.goto("/calendar?feature_disabled=image_generation", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(800);

  const data = await page.evaluate(() => ({
    hasBanner: !!document.body.textContent?.includes("Image generation is paused"),
    hasRunAutopilotDisabled: !!Array.from(document.querySelectorAll("button")).find(b => /Run autopilot \(disabled\)/.test(b.textContent || "")),
    hasRearmDisabled: !!Array.from(document.querySelectorAll("button")).find(b => /Rearm pending \(disabled\)/.test(b.textContent || "")),
    hasRebuildDisabled: !!Array.from(document.querySelectorAll("button")).find(b => /Rebuild all videos \(disabled\)/.test(b.textContent || "")),
    hasBulkApprove: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Bulk-approve"),
    hasAddPost: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Add post")),
  }));
  console.log("Calendar inspect:", data);
  await page.screenshot({ path: "tests/e2e/screenshots/calendar-disabled-banner-412.png", fullPage: false });

  expect(data.hasBanner).toBe(true);
  expect(data.hasRunAutopilotDisabled).toBe(true);
  expect(data.hasRearmDisabled).toBe(true);
  expect(data.hasRebuildDisabled).toBe(true);
  // Bulk-approve and Add post are still enabled (manual flow)
  expect(data.hasBulkApprove).toBe(true);
  expect(data.hasAddPost).toBe(true);
});
