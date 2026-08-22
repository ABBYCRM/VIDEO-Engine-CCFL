import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const providers = [
  { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Reference editing.", models: ["gemini-2.5-flash-image"], supportsTurnaround: true },
  { id: "openai", label: "OpenAI image generation", envVar: "OPENAI_API_KEY", help: "Reference editing fallback.", models: ["gpt-image-1"], supportsTurnaround: true },
  { id: "xai", label: "xAI Grok Imagine", envVar: "XAI_API_KEY", help: "Fresh portraits only.", models: ["grok-imagine-image"], supportsTurnaround: false }
];

test("avatar image settings switch providers and refresh model choices", async ({ page }) => {
  await stubAuthenticatedSession(page);
  let saved = { configured: true, provider: "gemini", model: "gemini-2.5-flash-image", providers, modelChoices: ["gemini-2.5-flash-image"] };
  await page.route("**/api/admin/avatars", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ avatars: [] }) }));
  await page.route("**/api/admin/avatars/image-settings", async route => {
    if (route.request().method() === "POST") {
      const input = await route.request().postDataJSON();
      saved = { configured: true, provider: input.provider, model: input.model, providers, modelChoices: input.provider === "openai" ? ["gpt-image-1"] : ["gemini-2.5-flash-image"] };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved) });
  });
  await page.goto("/avatars");
  await page.getByRole("button", { name: /Image: gemini/i }).click();
  await page.getByRole("button", { name: /OpenAI image generation/i }).click();
  await expect(page.getByLabel("Model")).toHaveValue("gpt-image-1");
  await expect(page.getByRole("button", { name: /xAI Grok Imagine/i })).toBeDisabled();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Image: openai · gpt-image-1/i })).toBeVisible();
});

test("gemini spending cap failure is summarized and recoverable", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const failedView = { file: null, status: "missing", generationStatus: "failed", generationModel: "gemini-2.5-flash-image", generationError: "Gemini image API HTTP 429: project has exceeded its monthly spending cap" };
  await page.route("**/api/admin/avatars", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ avatars: [{ id: "female-anchor-01", name: "Female Anchor 01", gender: "female", archetype: "newsroom spokesperson", wardrobeStandard: "tailored blazer / blouse / slacks", notes: "Professional newsroom anchor", referenceImage: "/avatars/female-anchor-01/identity.jpg", referenceImageNote: null, wardrobeRegenerationPrompt: null, status: "draft", turnaroundStatus: "failed", turnaroundModel: "gemini-2.5-flash-image", turnaroundError: failedView.generationError, views: { front: failedView, left: failedView, right: failedView, back: failedView } }] }) }));
  await page.route("**/api/admin/avatars/image-settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: true, provider: "gemini", model: "gemini-2.5-flash-image", providers, modelChoices: ["gemini-2.5-flash-image"] }) }));
  await page.route("**/api/admin/avatars/female-anchor-01/reset?all=true", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.goto("/avatars");
  await expect(page.getByText("Gemini spending cap reached")).toBeVisible();
  await expect(page.getByText(/The failure is upstream billing/)).toBeVisible();
  await expect(page.getByText(/Gemini image generation is blocked by the project spending cap/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear failed state" })).toBeVisible();
});
