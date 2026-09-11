import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Forge console is a first-class operator surface", async ({ page }) => {
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
    const body = route.request().postDataJSON() as { op?: string };
    if (body.op === "create" || body.op === "boot") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          session: {
            id: "forge-e2e",
            status: "RUNNING",
            url: "about:blank",
            title: "Claw Forge",
            stealth: "coherence",
            cookieCount: 0,
            screenshotJpeg: null,
            cdpHttp: "http://127.0.0.1:9222",
            handoffReason: null,
            probe: null,
            scrape: null,
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sessions: [] }) });
  });

  await page.goto("/forge");
  await expect(page.getByText("Claw Forge")).toBeVisible();
  await expect(page.getByText(/Not a CAPTCHA farm/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Probe lab" })).toBeVisible();
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByText("forge-e2e".slice(0, 8))).toBeVisible();
});
