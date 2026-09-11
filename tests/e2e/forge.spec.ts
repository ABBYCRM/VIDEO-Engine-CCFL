import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Forge is a live view Claw drives, not an operator console", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/forge", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          live: 0,
          cap: 4,
          contract: { name: "Claw Forge", doesNot: ["Farm CAPTCHAs or inject solver tokens"] },
          sessions: [],
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: [] }) });
  });

  await page.goto("/forge");
  await expect(page.getByText("Claw Forge")).toBeVisible();
  await expect(page.getByText(/Talk to Claw/i)).toBeVisible();
  await expect(page.getByText(/Waiting for Claw to dispatch Forge/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New session" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Probe lab" })).toHaveCount(0);
});
