import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("avatar image settings can switch to NVIDIA FLUX", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/admin/avatars", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ avatars: [] }) }));
  await page.route("**/api/admin/avatars/image-settings", async route => {
    const common = {
      providers: [
        { id: "nvidia", label: "NVIDIA FLUX.2 Klein 4B", envVar: "NVIDIA_API_KEY", help: "Preferred avatar turnaround provider." },
        { id: "gemini", label: "Google Gemini image generation", envVar: "GEMINI_API_KEY", help: "Fallback." }
      ]
    };
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...common, configured: true, provider: "nvidia", model: "black-forest-labs/flux.2-klein-4b", modelChoices: ["black-forest-labs/flux.2-klein-4b"] }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...common, configured: false, provider: "gemini", model: "gemini-2.0-flash-exp", modelChoices: ["gemini-2.0-flash-exp"] }) });
  });

  await page.goto("/avatars");
  await page.getByRole("button", { name: /Set image API key/i }).click();
  await page.getByRole("button", { name: /NVIDIA FLUX\.2 Klein 4B/i }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Image: nvidia · black-forest-labs\/flux\.2-klein-4b/i)).toBeVisible();
});
