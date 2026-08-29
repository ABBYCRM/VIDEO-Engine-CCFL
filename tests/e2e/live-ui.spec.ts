import { expect, test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

test("deployed app readiness and login UI are reachable", async ({ page, request }) => {
  const ready = await request.get("/api/ready", { ignoreHTTPSErrors: true });
  expect(ready.status()).toBe(200);
  await expect(ready.json()).resolves.toMatchObject({ ok: true, service: "VIDEO-Engine", check: "readiness" });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "VIDEO-Engine" })).toBeVisible();
  await expect(page.getByText("Admin console")).toBeVisible();
  await expect(page.getByPlaceholder("Admin password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});
