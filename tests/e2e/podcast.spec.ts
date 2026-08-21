import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=";

test("podcast composer previews upload, writes copy, creates avatar, and starts video", async ({ page }) => {
  await stubAuthenticatedSession(page);

  await page.route("**/api/internal/ugc/write", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      script: "Here is the short podcast script.",
      hook: "WATCH THIS",
      captions: ["Here is the point"],
      postCaption: "A concise social caption."
    })
  }));
  await page.route("**/api/internal/nvidia/image", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ base64: ONE_PIXEL_PNG, mimeType: "image/png", model: "black-forest-labs/flux.1-schnell" })
  }));
  await page.route("**/api/internal/generate", route => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "job-1", status: "running" } })
  }));
  await page.route("**/api/v1/video/job-1", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "job-1", status: "succeeded", fileUrl: "/api/v1/video/job-1/file" })
  }));
  await page.route("**/api/v1/video/job-1/file", route => route.fulfill({ status: 200, contentType: "video/mp4", body: "" }));

  await page.goto("/podcast-interview");
  await expect(page.getByRole("heading", { name: "Podcast Composer" })).toBeVisible();

  const upload = page.locator('input[type="file"][accept="video/*"]');
  await upload.setInputFiles({ name: "context.mp4", mimeType: "video/mp4", buffer: Buffer.from("fake-video") });
  await expect(page.getByLabel("Podcast composition preview").locator("video").first()).toBeVisible();

  await page.getByText("Mission").locator("..").locator("textarea").fill("Explain why documenting the scene matters.");
  await page.getByRole("button", { name: "Write script + captions" }).click();
  await expect(page.getByDisplayValue("WATCH THIS")).toBeVisible();
  await expect(page.getByDisplayValue("Here is the short podcast script.")).toBeVisible();
  await expect(page.getByText("A concise social caption.")).toBeVisible();

  await page.getByRole("button", { name: "Generate avatar" }).click();
  await expect(page.getByAltText("Generated AI host")).toBeVisible();

  await page.getByLabel("Provider").selectOption("hedra");
  await page.getByRole("button", { name: "Generate lower AI video" }).click();
  await expect(page.getByText(/Generating hedra talking head/)).toBeVisible();
  await expect.poll(async () => page.getByLabel("Podcast composition preview").locator("video").count(), { timeout: 10000 }).toBeGreaterThan(1);

  const split = page.locator('input[type="range"]');
  await split.fill("40");
  await expect(page.getByText("Top 40% source · Bottom 60% AI host")).toBeVisible();
});
