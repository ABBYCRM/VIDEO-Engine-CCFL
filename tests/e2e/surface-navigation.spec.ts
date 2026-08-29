import { expect, test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("retired surfaces redirect and the navigation exposes only current operator pages", async ({ page, request }) => {
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  for (const path of ["/", "/creator", "/avatars", "/campaigns", "/pipeline", "/sites", "/integrations", "/podcast-interview", "/components-demo", "/docs"]) {
    const response = await request.get(path, { ignoreHTTPSErrors: true, maxRedirects: 0 });
    expect([301, 302, 307, 308], `${path} should redirect, got ${response.status()}`).toContain(response.status());
    expect(response.headers().location || "", `${path} should redirect to Calendar`).toContain("/calendar");
  }

  for (const path of ["/claw", "/calendar", "/library", "/settings"]) {
    const response = await request.get(path, { ignoreHTTPSErrors: true });
    expect(response.ok(), `${path} should render, got ${response.status()}`).toBeTruthy();
  }

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Content Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Claw" })).toHaveAttribute("href", "/claw");
  await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
  await expect(nav.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  await expect(nav.getByRole("link")).toHaveCount(4);
});
