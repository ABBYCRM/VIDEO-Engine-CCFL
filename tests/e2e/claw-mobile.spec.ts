import { test, expect } from "@playwright/test";

/**
 * Mobile layout inspector for the Claw page.
 * No AI calls. Verifies the page renders correctly at mobile width with the
 * mobile-first wrapper in place.
 */
test.use({
  ignoreHTTPSErrors: true,
  viewport: { width: 412, height: 915 }
});

test("claw page renders at mobile size with correct layout", async ({ page, request }) => {
  test.setTimeout(60000);
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  await page.goto("/claw", { waitUntil: "networkidle" });
  // Wait for an actual readiness signal (the header controls finishing their
  // mount) instead of a fixed sleep — a fixed delay is a race with whatever
  // client-side work happens to be slow that day, not a correctness check.
  await page.getByRole("button", { name: "Threads" }).waitFor({ state: "visible" });

  const data = await page.evaluate(() => {
    function rect(el: Element | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    const main = document.querySelector("main");
    const mainRect = main?.getBoundingClientRect();
    // Find the visible textarea
    const ta = document.querySelector("textarea");
    const taRect = ta?.getBoundingClientRect();
    // Find the chat section (the one with the textarea inside)
    const chatSection = document.querySelector("section.flex.flex-1");
    const csRect = chatSection?.getBoundingClientRect();
    return {
      docScrollW: document.documentElement.scrollWidth,
      hasHorizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      mainW: mainRect ? Math.round(mainRect.width) : null,
      mainX: mainRect ? Math.round(mainRect.x) : null,
      chatSection: csRect ? { w: Math.round(csRect.width), x: Math.round(csRect.x) } : null,
      textarea: taRect ? { w: Math.round(taRect.width), x: Math.round(taRect.x) } : null,
      hasThreadsButton: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Threads"),
      hasFilesButton: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "Files"),
      hasNewButton: !!Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "New"),
      hasSendOrStop: !!Array.from(document.querySelectorAll("button")).find(b => /send|stop/i.test(b.textContent || "")),
    };
  });

  console.log("\n=== CLAW PAGE INSPECT (412x915) ===");
  console.log(JSON.stringify(data, null, 2));

  await page.screenshot({ path: "tests/e2e/screenshots/claw-mobile-412.png", fullPage: false });

  // Asserts
  expect(data.hasHorizScroll).toBe(false);
  expect(data.hasThreadsButton).toBe(true);
  expect(data.hasFilesButton).toBe(true);
  expect(data.hasNewButton).toBe(true);
  expect(data.hasSendOrStop).toBe(true);
  // Chat section should fill the mobile width (412 minus any global app padding).
  // It should NOT be 1000+ wide like the previous fullBleed version.
  if (data.chatSection) {
    expect(data.chatSection.w).toBeLessThan(500);
  }
});
