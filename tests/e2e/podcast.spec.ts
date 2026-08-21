import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";

test("podcast composer previews upload, writes 30s copy, creates avatar, and starts Hedra", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/internal/ugc/write", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ script: "Here is the thirty second podcast script.", hook: "WATCH THIS", captions: ["Here is the point"], postCaption: "A concise social caption." }) }));
  await page.route("**/api/internal/nvidia/image", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base64: ONE_PIXEL_PNG, mimeType: "image/png", model: "black-forest-labs/flux.1-schnell" }) }));
  await page.route("**/api/internal/generate", async route => {
    const body = await route.request().postDataJSON();
    expect(body.provider).toBe("hedra");
    expect(body.durationSeconds).toBe(30);
    expect(body.audioBase64).toBeTruthy();
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: "job-1", status: "running" } }) });
  });
  await page.route("**/api/v1/video/job-1", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "job-1", status: "succeeded", fileUrl: "/api/v1/video/job-1/file" }) }));
  await page.route("**/api/v1/video/job-1/file", route => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));

  await page.goto("/podcast-interview");
  await expect(page.getByRole("heading", { name: "Podcast Composer" })).toBeVisible();
  await page.locator('input[type="file"][accept="video/*"]').setInputFiles({ name: "context.mp4", mimeType: "video/mp4", buffer: Buffer.from("fake-video") });
  await expect(page.getByLabel("Podcast composition preview").locator("video").first()).toBeVisible();

  await page.getByLabel("Mission").fill("Explain why documenting the scene matters.");
  await page.getByRole("button", { name: "Write script + captions" }).click();
  await expect(page.getByLabel("Hook")).toHaveValue("WATCH THIS");
  await expect(page.getByLabel("30-second spoken script")).toHaveValue("Here is the thirty second podcast script.");

  await page.getByRole("button", { name: "Generate avatar" }).click();
  await expect(page.getByAltText("Generated AI host")).toBeVisible();
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({ name: "voice.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("fake-audio") });
  await expect(page.getByText("voice.mp3")).toBeVisible();

  await page.getByRole("button", { name: "Generate 30s Hedra video" }).click();
  await expect(page.getByText(/Generating hedra talking head/)).toBeVisible();
  await expect.poll(async () => page.getByLabel("Podcast composition preview").locator("video").count(), { timeout: 10000 }).toBeGreaterThan(1);

  await page.locator('input[type="range"]').fill("40");
  await expect(page.getByText("Top 40% source · Bottom 60% AI host")).toBeVisible();
});
