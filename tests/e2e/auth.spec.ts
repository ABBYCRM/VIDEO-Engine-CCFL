import { expect, test } from "@playwright/test";

const TEST_PASSWORD = "playwright-admin-password";

test("protected Claw redirects to login and accepts the configured admin password", async ({ page }) => {
  await page.goto("/claw");
  await expect(page).toHaveURL(/\/login\?next=%2Fclaw$/);
  await expect(page.getByRole("heading", { name: "Sign in to Claw" })).toBeVisible();

  await page.getByLabel("Admin password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid credentials");

  await page.getByLabel("Admin password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/claw$/);

  const session = await page.request.get("/api/admin/session");
  expect(session.status()).toBe(200);
  await expect(page.getByText("AI Operator Console")).toBeVisible();
});
