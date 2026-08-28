import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { stubAuthenticatedSession } from "./helpers";

const ASSETS = [
  {
    id: "generated:1",
    kind: "generated",
    mediaType: "image",
    label: "Generated avatar",
    title: "FLUX portrait",
    url: "/test-avatar.png",
    model: "black-forest-labs/flux.1-schnell",
    prompt: "internal",
    createdAt: "2026-08-28T00:00:00.000Z"
  },
  {
    id: "video:1",
    kind: "video",
    mediaType: "video",
    label: "ugc video",
    title: "HEDRA generated video",
    url: "/test-video.mp4",
    model: "hedra-character-3",
    prompt: null,
    createdAt: "2026-08-28T00:00:00.000Z"
  },
  {
    id: "avatar:female:front",
    kind: "turnaround",
    mediaType: "image",
    label: "front view",
    title: "Female Anchor 01",
    url: "/front.png",
    model: "gemini-2.5-flash-image",
    prompt: null,
    createdAt: "2026-08-28T00:00:00.000Z"
  }
] as const;

async function stubLibrary(page: Page) {
  await stubAuthenticatedSession(page);
  await page.route("**/api/library", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ assets: ASSETS })
  }));
  await page.route("**/test-avatar.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("89504e470d0a1a0a", "hex")
  }));
  await page.route("**/front.png", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("89504e470d0a1a0a", "hex")
  }));
  await page.route("**/test-video.mp4", (route) => route.fulfill({
    status: 200,
    contentType: "video/mp4",
    body: "fake-video"
  }));
}

test("Library filters and downloads individual images and videos", async ({ page }) => {
  await stubLibrary(page);
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText("FLUX portrait")).toBeVisible();
  await expect(page.getByText("HEDRA generated video")).toBeVisible();
  await expect(page.getByText("Female Anchor 01")).toBeVisible();

  await page.getByRole("button", { name: "videos", exact: true }).click();
  await expect(page.getByText("HEDRA generated video")).toBeVisible();
  await expect(page.getByText("FLUX portrait")).toHaveCount(0);

  let downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HEDRA generated video" }).click();
  let download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hedra-generated-video-ugc-video.mp4");

  await page.getByRole("button", { name: "images", exact: true }).click();
  await expect(page.getByText("FLUX portrait")).toBeVisible();
  downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download FLUX portrait" }).click();
  download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("flux-portrait-generated-avatar.png");

  await page.getByLabel("Search library").fill("Female Anchor");
  await expect(page.getByText("Female Anchor 01")).toBeVisible();
  await expect(page.getByText("FLUX portrait")).toHaveCount(0);
});

test("Library bulk download creates one ZIP containing every selected asset", async ({ page }) => {
  await stubLibrary(page);
  await page.goto("/library");

  const bulkButton = page.getByRole("button", { name: /^Download selected/ });
  await expect(bulkButton).toBeDisabled();
  await page.getByRole("checkbox", { name: "Select FLUX portrait" }).check();
  await page.getByRole("checkbox", { name: "Select HEDRA generated video" }).check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await expect(bulkButton).toHaveText("Download selected (2)");

  const downloadPromise = page.waitForEvent("download");
  await bulkButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^video-engine-library-\d{4}-\d{2}-\d{2}\.zip$/);

  const downloadPath = await download.path();
  expect(downloadPath, "Playwright should persist the downloaded ZIP").not.toBeNull();
  const zip = await JSZip.loadAsync(await fs.readFile(downloadPath!));
  expect(Object.keys(zip.files).sort()).toEqual([
    "flux-portrait-generated-avatar.png",
    "hedra-generated-video-ugc-video.mp4"
  ]);
  expect(await zip.file("hedra-generated-video-ugc-video.mp4")!.async("string")).toBe("fake-video");

  await expect(bulkButton).toBeEnabled();
  await expect(bulkButton).toHaveText("Download selected (2)");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Library select-visible respects the active filter and can be cleared", async ({ page }) => {
  await stubLibrary(page);
  await page.goto("/library");

  await page.getByRole("button", { name: "images", exact: true }).click();
  await page.getByRole("button", { name: "Select visible (2)" }).click();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select FLUX portrait" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Select Female Anchor 01" })).toBeChecked();

  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Download selected/ })).toBeDisabled();
});
