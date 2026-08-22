import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Library is a filterable generated-image gallery, not a prompt dump", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/library", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ assets: [
      { id:"generated:1", kind:"generated", label:"Generated avatar", title:"black-forest-labs/flux.1-schnell", url:"/test-avatar.png", model:"black-forest-labs/flux.1-schnell", prompt:"podcast host", createdAt:new Date().toISOString() },
      { id:"avatar:female:front", kind:"turnaround", label:"front view", title:"Female Anchor 01", url:"/front.png", model:"gemini-2.5-flash-image", prompt:null, createdAt:new Date().toISOString() }
    ] })
  }));

  await page.goto("/library");
  await expect(page.getByRole("heading", { name:"Library" })).toBeVisible();
  await expect(page.getByText("black-forest-labs/flux.1-schnell").first()).toBeVisible();
  await expect(page.getByText("Female Anchor 01")).toBeVisible();
  await expect(page.getByText("Prompt RAG Library")).toHaveCount(0);

  await page.getByRole("button", { name:"generated", exact:true }).click();
  await expect(page.getByText("Female Anchor 01")).toHaveCount(0);
  await expect(page.getByText("black-forest-labs/flux.1-schnell").first()).toBeVisible();

  await page.getByRole("button", { name:"all", exact:true }).click();
  await page.getByLabel("Search library").fill("Female Anchor");
  await expect(page.getByText("Female Anchor 01")).toBeVisible();
  await expect(page.getByText("black-forest-labs/flux.1-schnell").first()).toHaveCount(0);
});
