import { test, expect } from "@playwright/test";

/**
 * Mobile layout inspector for the Claw page (Claude-style console).
 * No AI calls. Verifies the page renders correctly at mobile width with no
 * horizontal overflow and the core composer + nav controls present.
 */
test.use({
  ignoreHTTPSErrors: true,
  viewport: { width: 412, height: 915 }
});

test("claw page renders at mobile size with correct layout", async ({ page, request }) => {
  test.setTimeout(60000);
  // The deployment is private with no login gate, but the legacy login route
  // still exists and setting the session cookie is harmless; skip failures.
  const login = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  }).catch(() => null);
  if (login && login.ok()) {
    const storage = await request.storageState();
    await page.context().addCookies(storage.cookies);
  }

  await page.goto("/claw", { waitUntil: "networkidle" });
  // Readiness signal: the composer textarea has mounted.
  await page.locator("textarea").first().waitFor({ state: "visible" });

  const data = await page.evaluate(() => {
    function hasBtn(labelOrText: string) {
      const needle = labelOrText.toLowerCase();
      return Array.from(document.querySelectorAll("button")).some((b) => {
        const text = (b.textContent || "").trim().toLowerCase();
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        return text === needle || aria === needle;
      });
    }
    const chatSection = document.querySelector("section.flex.flex-1");
    const csRect = chatSection?.getBoundingClientRect();
    return {
      hasHorizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      chatSection: csRect ? { w: Math.round(csRect.width), x: Math.round(csRect.x) } : null,
      hasNewChat: hasBtn("New chat"),
      hasFiles: hasBtn("Files"),
      hasOpenSidebar: hasBtn("Open sidebar"),
      hasSend: hasBtn("Send message"),
      hasAttach: hasBtn("Attach files"),
    };
  });

  console.log("\n=== CLAW PAGE INSPECT (412x915) ===");
  console.log(JSON.stringify(data, null, 2));

  await page.screenshot({ path: "tests/e2e/screenshots/claw-mobile-412.png", fullPage: false });

  // No horizontal overflow at mobile width — the core mobile-layout guarantee.
  expect(data.hasHorizScroll).toBe(false);
  // Core composer + nav controls are present.
  expect(data.hasNewChat).toBe(true);
  expect(data.hasFiles).toBe(true);
  expect(data.hasOpenSidebar).toBe(true);
  expect(data.hasSend).toBe(true);
  expect(data.hasAttach).toBe(true);
  // Chat section fills the mobile width, not a 1000+ fullBleed column.
  if (data.chatSection) {
    expect(data.chatSection.w).toBeLessThan(500);
  }
});
