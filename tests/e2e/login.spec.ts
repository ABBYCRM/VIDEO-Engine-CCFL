import { expect, test } from "@playwright/test";

test("login rejects the old hardcoded unlock and accepts ADMIN_PASSWORD", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Claw" })).toBeVisible();
  await page.getByLabel("Admin password").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("p[role='alert']")).toContainText(/Invalid password|not configured/i);

  await page.getByLabel("Admin password").fill(process.env.ADMIN_PASSWORD || "e2e-local-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/claw/, { timeout: 15_000 });
});
