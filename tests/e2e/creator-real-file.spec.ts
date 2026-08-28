import { test, expect } from "@playwright/test";

/**
 * Operator-reported bug reproduction. The operator's flow:
 *   1. Open /creator on the phone
 *   2. Tap "Tap to pick a video", choose a 2.6MB .mp4
 *   3. Write a subject
 *   4. Tap "Generate with NVIDIA" to get a caption
 *   5. Tap "Upload + schedule"
 *   6. See "Error: Failed to fetch" or the retry message
 *
 * This test uses a real-ish 2.6MB file to confirm the fix works for
 * the exact file size the operator was uploading.
 */
test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("creator upload: 2.6MB real file posts successfully", async ({ page, request }) => {
  test.setTimeout(120000);
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(login.ok(), `login HTTP ${login.status()}`).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  await page.goto("/creator", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Creator", exact: true })).toBeVisible();

  // 2.6MB file (matches the operator's clip)
  const ftyp = Buffer.from(
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAetbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAg==",
    "base64"
  );
  const tiny = Buffer.concat([ftyp, Buffer.alloc(2_600_000, 0)]);

  const fileInput = page.locator("input[type='file']");
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles({ name: "car-crash.mp4", mimeType: "video/mp4", buffer: tiny });
  await expect(page.locator("video")).toBeVisible();

  // Fill subject (unique placeholder)
  const subjectInput = page.locator("input[placeholder*='Biscayne' i]").first();
  await subjectInput.fill("Got in a car crash");
  await expect(subjectInput).toHaveValue("Got in a car crash");

  // Listen for the upload response
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/creator/upload") && r.request().method() === "POST",
    { timeout: 90000 }
  );

  const uploadBtn = page.getByRole("button", { name: "Upload + schedule" });
  await expect(uploadBtn).toBeEnabled();
  await uploadBtn.click();

  const response = await responsePromise;
  expect(response.status(), `upload HTTP ${response.status()}`).toBe(200);

  const body = await response.json();
  expect(body.ok, "body.ok should be true").toBe(true);
  expect(body.scheduledPostIds?.length, "should have 2 scheduled post ids (reel + story)").toBe(2);
  // Confirm the file was actually uploaded (not empty body)
  expect(body.bytes, "file bytes should be ~2.6MB").toBeGreaterThan(2_500_000);

  // The regression contract: the busy spinner clears and the real scheduled
  // upload appears in the UI, not merely in the API response.
  await expect(uploadBtn).toBeEnabled();
  await expect(uploadBtn.locator("svg.animate-spin")).toHaveCount(0);
  await expect(page.getByText(/Scheduled 2 post\(s\) for reel, story/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /car-crash · (reel|story)/ })).toBeVisible();
  await expect(page.getByText(/reel \+ story|story \+ reel/)).toBeVisible();

  // Screenshot of the success state
  await page.screenshot({ path: "tests/e2e/screenshots/creator-real-file-success-412.png", fullPage: false });

  // Clean up via API
  const ids = body.scheduledPostIds.join(",");
  await request.delete(`/api/creator/posts?ids=${ids}`);
});
