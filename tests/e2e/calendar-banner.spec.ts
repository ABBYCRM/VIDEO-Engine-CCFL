import { test, expect } from "@playwright/test";

/** Captures a screenshot of the Calendar with the redirect banner. */
test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("calendar renders the disabled-image-gen banner when redirected", async ({ page, request }) => {
  test.setTimeout(60000);
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  // Visit the page as if we just clicked a deep link to a retired page
  // (Avatars/Campaigns/Pipeline/Sites/Integrations) - that redirect stands
  // independently of the image-gen flag (re-enabled 2026-08-28).
  await page.goto("/calendar?feature_disabled=image_generation", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.waitForTimeout(800);

  const data = await page.evaluate(() => ({
    hasBanner: !!document.body.textContent?.includes("That page has moved"),
    hasRunAutopilotEnabled: !!Array.from(document.querySelectorAll("button")).find(b => /^Run autopilot$/.test(b.textContent?.trim() || "") && !b.disabled),
    hasRearmEnabled: !!Array.from(document.querySelectorAll("button")).find(b => /^Rearm pending$/.test(b.textContent?.trim() || "") && !b.disabled),
    hasRebuildEnabled: !!Array.from(document.querySelectorAll("button")).find(b => /^Rebuild all videos$/.test(b.textContent?.trim() || "") && !b.disabled),
    hasBulkApprove: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Bulk-approve"),
    hasAddPost: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Add post")),
  }));
  console.log("Calendar inspect:", data);
  await page.screenshot({ path: "tests/e2e/screenshots/calendar-disabled-banner-412.png", fullPage: false });

  expect(data.hasBanner).toBe(true);
  // Image gen is back on (2026-08-28): these are real, clickable actions now.
  expect(data.hasRunAutopilotEnabled).toBe(true);
  expect(data.hasRearmEnabled).toBe(true);
  expect(data.hasRebuildEnabled).toBe(true);
  expect(data.hasBulkApprove).toBe(true);
  expect(data.hasAddPost).toBe(true);
});
