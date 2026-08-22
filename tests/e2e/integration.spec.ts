import { expect, test, type Locator, type Page } from "@playwright/test";

async function realLogin(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Admin password").fill(process.env.ADMIN_PASSWORD || "e2e-local-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible({ timeout: 15000 });
}

function field(page: Page, label: string): Locator {
  return page.locator("label").filter({ hasText: new RegExp(`^${label}`) });
}
function fieldSelect(page: Page, label: string) {
  return field(page, label).locator("select");
}
function fieldInput(page: Page, label: string) {
  return field(page, label).locator("input");
}
function fieldTextarea(page: Page, label: string) {
  return field(page, label).locator("textarea");
}

test("real admin workflow persists a Site and Calendar article without API stubs", async ({ page }) => {
  await realLogin(page);
  const suffix = Date.now();
  const siteName = `E2E Editorial ${suffix}`;
  const siteUrl = `https://e2e-${suffix}.example.com`;
  const articleTitle = `E2E article ${suffix}`;

  await page.goto("/sites");
  await page.getByRole("button", { name: "Add site", exact: true }).click();
  await fieldInput(page, "Site name").fill(siteName);
  await fieldInput(page, "Website URL").fill(siteUrl);
  await fieldSelect(page, "CMS / publishing target").selectOption("wordpress");
  await fieldSelect(page, "Publishing cadence").selectOption("manual");
  await fieldSelect(page, "Approval policy").selectOption("manual");
  await fieldSelect(page, "Image style").selectOption("hyper-realistic");
  await page.getByRole("button", { name: "Save site", exact: true }).click();
  await expect(page.getByText(/Install header code/i)).toBeVisible();
  await expect(page.locator("pre")).toContainText("/api/sites/bridge.js?key=ve_site_");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByText(siteName)).toBeVisible();
  await expect(page.getByText(siteUrl)).toBeVisible();

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Add post", exact: true }).click();
  await fieldInput(page, "Title").fill(articleTitle);
  await fieldSelect(page, "Format").selectOption("blog");
  await fieldSelect(page, "Network").selectOption("website");
  await fieldTextarea(page, "Caption / excerpt / review notes").fill("Owner review excerpt.");
  await fieldInput(page, "SEO title").fill("E2E SEO title");
  await fieldInput(page, "Focus keyword").fill("e2e editorial test");
  await fieldInput(page, "Slug").fill(`e2e-article-${suffix}`);
  await fieldTextarea(page, "Meta description").fill("A deterministic integration article used to verify the real Calendar persistence workflow.");
  await fieldTextarea(page, "Article body").fill("## Integration article\n\nThis is persisted through the real Calendar API and SQLite database during CI.\n\n- Reviewable\n- Editable\n- Approval controlled");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(articleTitle).first()).toBeVisible();
  const queueItem = page.locator("article").filter({ hasText: articleTitle });
  await expect(queueItem).toContainText("pending");
  await queueItem.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: articleTitle })).toContainText("approved");

  await page.reload();
  await expect(page.getByText(articleTitle).first()).toBeVisible();
  await page.getByText(articleTitle).first().click();
  await expect(fieldTextarea(page, "Article body")).toHaveValue(/Integration article/);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.goto("/sites");
  const siteCard = page.locator("section").filter({ hasText: siteName });
  page.once("dialog", dialog => dialog.accept());
  await siteCard.getByRole("button", { name: `Remove ${siteName}`, exact: true }).click();
  await expect(page.getByText(siteName)).toHaveCount(0);
});
