import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";

test("create keeps all video engines selectable and Hedra exposes long-form inputs", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/admin/settings", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      defaultProvider: "veo",
      providers: {
        veo: { keyConfigured: true }, grok: { keyConfigured: true }, a2e: { keyConfigured: true }, hedra: { keyConfigured: true }
      }
    })
  }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create campaign content" })).toBeVisible();
  for (const provider of ["Google Veo 3.1", "xAI Grok Imagine", "A2E AI router", "Hedra"]) {
    await expect(page.getByRole("button", { name: new RegExp(provider, "i") })).toBeVisible();
  }

  await page.getByRole("button", { name: /Hedra/i }).click();
  await expect(page.getByLabel("Hedra duration")).toHaveValue("30");
  await expect(page.getByText("Driving audio (required)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate 30s with Hedra" })).toBeDisabled();
});

test("successful campaign generation can enter the pending approval queue", async ({ page }) => {
  await stubAuthenticatedSession(page);
  let calendarPayload: any = null;
  await page.route("**/api/admin/settings", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ defaultProvider: "veo", providers: { veo: { keyConfigured: true } } }) }));
  await page.route("**/api/internal/generate", route => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: "job-create", status: "running" } }) }));
  await page.route("**/api/v1/video/job-create", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "job-create", status: "succeeded", fileUrl: "/api/v1/video/job-create/file" }) }));
  await page.route("**/api/v1/video/job-create/file", route => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));
  await page.route("**/api/calendar", async route => {
    if (route.request().method() !== "POST") return route.continue();
    calendarPayload = await route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ post: { id: "scheduled-create", ...calendarPayload } }) });
  });

  await page.goto("/");
  await page.getByLabel("Mission").fill("Explain why scene documentation matters.");
  await page.getByRole("button", { name: "Generate 8s with Google Veo 3.1" }).click();
  await expect.poll(async () => page.getByRole("button", { name: "Send to approval Calendar" }).count(), { timeout: 10000 }).toBe(1);
  await page.getByRole("button", { name: "Send to approval Calendar" }).click();
  await expect(page.getByRole("button", { name: "Added to Calendar" })).toBeVisible();
  expect(calendarPayload.status).toBe("pending");
  expect(calendarPayload.autoPost).toBe(false);
  expect(calendarPayload.videoJobId).toBe("job-create");
});
