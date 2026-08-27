import { test, expect } from "@playwright/test";

/**
 * Visual / DOM inspector for the new Creator page.
 * Does NOT call any AI/image/video API. Only inspects the rendered DOM and takes
 * a screenshot. Safe to run on a deployment to verify the UI is wired correctly.
 */
test.use({
  ignoreHTTPSErrors: true,
  viewport: { width: 412, height: 915 }
});

test("creator page renders all the controls", async ({ page, request }) => {
  test.setTimeout(60000);
  // Login (this is a single API call to /api/admin/login, no token burn)
  const login = await request.post("/api/admin/login", { data: { password: "1234" }, ignoreHTTPSErrors: true });
  expect(login.ok(), `login HTTP ${login.status()}`).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  // Go to the creator page
  await page.goto("/creator", { waitUntil: "networkidle" });
  await page.waitForSelector("h1", { timeout: 10000 });

  // Inspect the DOM
  const data = await page.evaluate(() => {
    function rect(el: Element | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return {
      h1: document.querySelector("h1")?.textContent,
      title: rect(document.querySelector("h1")),
      mainW: document.querySelector("main")?.getBoundingClientRect().width,
      docScrollW: document.documentElement.scrollWidth,
      hasHorizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      // Find the format buttons (reel/story/post)
      formatButtons: Array.from(document.querySelectorAll("button"))
        .filter(b => /^(reel|story|post)$/i.test(b.textContent?.trim() || ""))
        .map(b => ({
          text: b.textContent?.trim(),
          pressed: b.getAttribute("aria-pressed"),
          rect: rect(b)
        })),
      // Find the topic dropdown
      hasTopicSelect: !!document.querySelector("select") && Array.from(document.querySelectorAll("option")).some(o => /accident|truck|slip|injury/i.test(o.textContent || "")),
      // Find the time dropdown
      hasTimeSelect: !!document.querySelector("select") && Array.from(document.querySelectorAll("option")).some(o => /^\d{2}:\d{2}$/.test(o.textContent?.trim() || "")),
      // Find the date input
      hasDateInput: !!document.querySelector('input[type="date"]'),
      // Find the network dropdown (Instagram / TikTok / etc)
      hasNetworkSelect: !!document.querySelector("select") && Array.from(document.querySelectorAll("option")).some(o => /instagram|tiktok|youtube|facebook/i.test(o.textContent || "")),
      // Find the upload area
      hasUploadButton: !!Array.from(document.querySelectorAll("button")).find(b => /pick a video|tap to pick|select video|choose video/i.test(b.textContent || "")),
      // Find the Change video / Remove video buttons (only show when a file is selected)
      hasChangeVideoButton: !!Array.from(document.querySelectorAll("button")).find(b => /change video/i.test(b.textContent || "")),
      hasRemoveVideoButton: !!Array.from(document.querySelectorAll("button")).find(b => /remove/i.test(b.textContent || "")),
      // Find the NVIDIA button
      hasNvidiaButton: !!Array.from(document.querySelectorAll("button")).find(b => /nvidia|generate/i.test(b.textContent || "")),
      // Find the upload + schedule button
      hasUploadScheduleButton: !!Array.from(document.querySelectorAll("button")).find(b => /upload.*schedule|schedule.*upload/i.test(b.textContent || "")),
    };
  });

  console.log("\n=== CREATOR PAGE INSPECT (412x915) ===");
  console.log(JSON.stringify(data, null, 2));

  // Take a screenshot
  await page.screenshot({ path: "tests/e2e/screenshots/creator-412.png", fullPage: false });

  // Also check the nav has the Creator link
  const navItems = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"));
    return links.map(a => ({ href: a.getAttribute("href"), text: a.textContent?.trim() }));
  });
  const hasCreatorNav = navItems.some(l => l.href === "/creator");
  console.log("Nav has Creator:", hasCreatorNav);

  // Assertions
  expect(data.h1).toBe("Creator");
  expect(data.hasHorizScroll).toBe(false);
  expect(data.formatButtons.length).toBe(3);
  expect(data.hasTopicSelect).toBe(true);
  expect(data.hasTimeSelect).toBe(true);
  expect(data.hasDateInput).toBe(true);
  expect(data.hasNetworkSelect).toBe(true);
  expect(data.hasUploadButton).toBe(true);
  expect(data.hasNvidiaButton).toBe(true);
  expect(data.hasUploadScheduleButton).toBe(true);
  expect(hasCreatorNav).toBe(true);
  // Before a file is picked, Change / Remove must NOT exist yet
  expect(data.hasChangeVideoButton).toBe(false);
  expect(data.hasRemoveVideoButton).toBe(false);

  // Upload a tiny dummy file via the hidden <input type=file> and verify the
  // new "Change video" + "Remove" buttons appear under the preview.
  const tiny = Buffer.from(
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAetbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAg==",
    "base64"
  );
  const fileInput = await page.$("input[type='file']");
  expect(fileInput, "file input should exist on /creator").not.toBeNull();
  await fileInput!.setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: tiny });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return {
      hasChangeVideo: !!btns.find(b => /change video/i.test(b.textContent || "")),
      hasRemove: !!btns.find(b => /^remove$|^\s*remove\s*$/i.test(b.textContent || "")),
      hasPreview: !!document.querySelector("video"),
    };
  });
  console.log("After file picked:", after);
  expect(after.hasPreview).toBe(true);
  expect(after.hasChangeVideo).toBe(true);
  expect(after.hasRemove).toBe(true);

  // Take a second screenshot showing the new buttons under the video
  await page.screenshot({ path: "tests/e2e/screenshots/creator-with-video-412.png", fullPage: false });
});
