import { expect, test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("current mobile operator surface has no horizontal overflow at supported widths", async ({ page, request }) => {
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Content Calendar" })).toBeVisible();

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 412, height: 915 },
    { width: 414, height: 896 }
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  }
});
