import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("campaign builder persists a campaign", async ({ page }) => {
  await stubAuthenticatedSession(page);
  let campaigns: any[] = [];
  await page.route("**/api/campaigns", async route => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ campaigns }) });
    if (req.method() === "POST") {
      const input = await req.postDataJSON();
      const campaign = { id: "campaign-1", status: "draft", createdAt: new Date().toISOString(), ...input };
      campaigns = [campaign];
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ campaign }) });
    }
    return route.continue();
  });

  await page.goto("/campaigns");
  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  await page.getByText("Campaign name").locator("..").locator("input").fill("Florida UGC test");
  await page.getByText("Mission").locator("..").locator("textarea").fill("Create an eight-second internal UGC test campaign.");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByText("Campaign saved.")).toBeVisible();
  await expect(page.getByText("Florida UGC test")).toBeVisible();
});
