import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("final operator workflow loads without dead navigation", async ({ page }) => {
  await stubAuthenticatedSession(page);
  for (const [path, heading] of [["/", "Create campaign content"], ["/campaigns", "Campaigns"], ["/avatars", "Avatars"], ["/sites", "Sites"], ["/library", "Library"], ["/calendar", "Content Calendar"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});
