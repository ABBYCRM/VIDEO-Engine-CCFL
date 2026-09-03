import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("MKTN guide is reachable from the left menu and explains term usage", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/mktn/terms**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ terms: [{ name: "Video Sales Letter", definition: "A persuasive video.", category: "advertising-creative", aliases: ["VSL"], when: "Use during campaign production.", where: "Use on landing pages and paid video.", how: "Build a hook, mechanism, proof, offer, and CTA.", why: "It explains an offer in a persuasive sequence." }], count: 1 }),
  }));
  await page.goto("/mktn");
  await expect(page.getByRole("heading", { name: "MKTN" })).toBeVisible();
  await expect(page.getByRole("link", { name: "MKTN", exact: true })).toBeVisible();
  await expect(page.getByText("Video Sales Letter")).toBeVisible();
  await expect(page.getByText("Build a hook, mechanism, proof, offer, and CTA.")).toBeVisible();
});

test("MKTN settings never receive stored secret values", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/mktn/terms**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ terms: [], count: 0 }) }));
  await page.route("**/api/mktn/settings", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ providers: { nvidia: { configured: true, source: "saved" }, hedra: { configured: true, source: "environment" }, gemini: { configured: false, source: "none" }, a2e: { configured: false, source: "none" } }, composio: { configured: true } }),
  }));
  await page.goto("/mktn");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("NVIDIA NIM")).toBeVisible();
  await expect(page.getByLabel("NVIDIA NIM API key")).toHaveValue("");
  await expect(page.getByText("Connected and shared with MKTN + Claw.")).toBeVisible();
});
