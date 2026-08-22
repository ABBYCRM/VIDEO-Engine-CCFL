import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("final workflow surfaces are present", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible();
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Sites" })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Content Calendar" })).toBeVisible();
});
