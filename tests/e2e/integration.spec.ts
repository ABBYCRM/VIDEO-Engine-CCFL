import { expect, test } from "@playwright/test";

async function realLogin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Admin password").fill(process.env.ADMIN_PASSWORD || "e2e-local-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible({ timeout: 15000 });
}

test("real admin workflow persists a Site and Calendar article without API stubs", async ({ page }) => {
  await realLogin(page);

  const suffix = Date.now();
  const siteName = `E2E Editorial ${suffix}`;
  const siteUrl = `https://e2e-${suffix}.example.com`;
  const articleTitle = `E2E article ${suffix}`;

  await page.goto("/sites");
  await page.getByRole("button", { name: "Add site" }).click();
  await page.getByLabel("Site name").fill(siteName);
  await page.getByLabel("Website URL").fill(siteUrl);
  await page.getByLabel("CMS / publishing target").selectOption("wordpress");
  await page.getByLabel("Publishing cadence").selectOption("manual");
  await page.getByLabel("Approval policy").selectOption("manual");
  await page.getByLabel("Image style").selectOption("hyper-realistic");
  await page.getByRole("button", { name: "Save site" }).click();

  await expect(page.getByText(/Install header code/i)).toBeVisible();
  await expect(page.locator("pre")).toContainText("/api/sites/bridge.js?key=ve_site_");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText(siteName)).toBeVisible();
  await expect(page.getByText(siteUrl)).toBeVisible();

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Add post" }).click();
  await page.getByLabel("Title").fill(articleTitle);
  await page.getByLabel("Format").selectOption("blog");
  await page.getByLabel("Network").selectOption("website");
  await page.getByLabel("Caption / excerpt / review notes").fill("Owner review excerpt.");
  await page.getByLabel("SEO title").fill("E2E SEO title");
  await page.getByLabel("Focus keyword").fill("e2e editorial test");
  await page.getByLabel("Slug").fill(`e2e-article-${suffix}`);
  await page.getByLabel("Meta description").fill("A deterministic integration article used to verify the real Calendar persistence workflow.");
  await page.getByLabel("Article body").fill("## Integration article\n\nThis is persisted through the real Calendar API and SQLite database during CI.\n\n- Reviewable\n- Editable\n- Approval controlled");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(articleTitle).first()).toBeVisible();
  const queueItem = page.locator("article").filter({ hasText: articleTitle });
  await expect(queueItem).toContainText("pending");
  await queueItem.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("article").filter({ hasText: articleTitle })).toContainText("approved");

  await page.reload();
  await expect(page.getByText(articleTitle).first()).toBeVisible();
  await page.getByText(articleTitle).first().click();
  await expect(page.getByLabel("Article body")).toContainText("Integration article");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/sites");
  const siteCard = page.locator("section").filter({ hasText: siteName });
  page.once("dialog", dialog => dialog.accept());
  await siteCard.getByRole("button", { name: `Remove ${siteName}` }).click();
  await expect(page.getByText(siteName)).toHaveCount(0);
});
