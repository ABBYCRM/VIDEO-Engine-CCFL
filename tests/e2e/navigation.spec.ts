import { expect, test } from "@playwright/test";
import { openNavigationIfNeeded, stubAuthenticatedSession } from "./helpers";

const routes = [
  ["Generate", "/"],
  ["Campaigns", "/campaigns"],
  ["Avatars", "/avatars"],
  ["Calendar", "/calendar"],
  ["Library", "/library"],
  ["Podcast Style", "/podcast-interview"],
  ["Integrations", "/integrations"],
  ["API", "/docs"],
  ["Settings", "/settings"]
] as const;

test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
});

test("every primary navigation link reaches a real page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Generate an 8-second campaign shot")).toBeVisible();

  for (const [label, path] of routes.slice(1)) {
    await openNavigationIfNeeded(page);
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
    await expect(page.locator("main").last()).toBeVisible();
  }
});

test("site controls route to campaign management instead of dead-ending", async ({ page }) => {
  await page.goto("/");
  await openNavigationIfNeeded(page);
  await page.getByRole("link", { name: "Open CaseClosedFL campaigns" }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await page.goto("/");
  await openNavigationIfNeeded(page);
  await page.getByRole("link", { name: "Manage websites" }).click();
  await expect(page).toHaveURL(/\/campaigns$/);
});
