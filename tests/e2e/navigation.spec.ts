import { expect, test } from "@playwright/test";
import { openNavigationIfNeeded, stubAuthenticatedSession } from "./helpers";

const routes = [
  ["Create", "/"],
  ["Campaigns", "/campaigns"],
  ["Avatars", "/avatars"],
  ["Library", "/library"],
  ["Calendar", "/calendar"],
  ["Integrations", "/integrations"],
  ["API", "/docs"],
  ["Settings", "/settings"]
] as const;

test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
});

test("every primary navigation link reaches a real page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible();

  for (const [label, path] of routes.slice(1)) {
    await openNavigationIfNeeded(page);
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
    await expect(page.locator("main").last()).toBeVisible();
  }
});

test("podcast is a real create mode instead of duplicate sidebar navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Podcast \/ split-screen/i }).click();
  await expect(page).toHaveURL(/\/podcast-interview$/);
  await expect(page.getByRole("heading", { name: "Podcast Composer" })).toBeVisible();
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
