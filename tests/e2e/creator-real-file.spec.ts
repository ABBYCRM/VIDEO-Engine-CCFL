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
  const login = await request.post("/api/admin/login", { data: { password: "1234" }, ignoreHTTPSErrors: true });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  await page.goto("/creator", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // 2.6MB file (matches the operator's clip)
  const ftyp = Buffer.from(
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAetbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAg==",
    "base64"
  );
  const tiny = Buffer.concat([ftyp, Buffer.alloc(2_600_000, 0)]);

  const fileInput = await page.$("input[type='file']");
  expect(fileInput).not.toBeNull();
  await fileInput!.setInputFiles({ name: "car-crash.mp4", mimeType: "video/mp4", buffer: tiny });

  // Wait for the file to register
  await page.waitForTimeout(1500);

  // Confirm the file preview is rendered
  const hasPreview = await page.evaluate(() => !!document.querySelector("video"));
  expect(hasPreview, "file preview should be rendered after file picker").toBe(true);

  // Fill subject (unique placeholder)
  const subjectInput = page.locator("input[placeholder*='Biscayne' i]").first();
  await subjectInput.click();
  await subjectInput.pressSequentially("Got in a car crash", { delay: 10 });
  await subjectInput.press("Tab");
  await page.waitForTimeout(200);
  const subjectVal = await subjectInput.inputValue();
  expect(subjectVal).toBe("Got in a car crash");

  // Listen for the upload response
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/creator/upload") && r.request().method() === "POST",
    { timeout: 90000 }
  );

  const uploadBtn = await page.$("button:has-text('Upload + schedule')");
  expect(uploadBtn).not.toBeNull();
  await uploadBtn!.click();

  const response = await responsePromise;
  expect(response.status(), `upload HTTP ${response.status()}`).toBe(200);

  const body = await response.json();
  expect(body.ok, "body.ok should be true").toBe(true);
  expect(body.scheduledPostIds?.length, "should have 2 scheduled post ids (reel + story)").toBe(2);
  // Confirm the file was actually uploaded (not empty body)
  expect(body.bytes, "file bytes should be ~2.6MB").toBeGreaterThan(2_500_000);

  // Wait for the success message
  await page.waitForTimeout(2000);
  const successVisible = await page.evaluate(() => /Scheduled|2 post/i.test(document.body.textContent || ""));
  expect(successVisible, "success message should appear in the UI").toBe(true);

  // Screenshot of the success state
  await page.screenshot({ path: "tests/e2e/screenshots/creator-real-file-success-412.png", fullPage: false });

  // Clean up via API
  const ids = body.scheduledPostIds.join(",");
  await request.delete(`/api/creator/posts?ids=${ids}`);
});
