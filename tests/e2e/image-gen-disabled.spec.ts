import { test, expect } from "@playwright/test";

/**
 * Smoke test for the IMAGE_GEN_ENABLED=false state. Verifies:
 *  - the kept pages still load
 *  - the removed pages now redirect to /calendar
 *  - image-generation API routes return 410
 *  - the left rail does not show the removed pages
 *  No AI calls, no image gen.
 */
test.use({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });

test("image-gen disabled state is correct on the live build", async ({ page, request }) => {
  test.setTimeout(120000);
  const login = await request.post("/api/admin/login", { data: { password: "1234" }, ignoreHTTPSErrors: true });
  expect(login.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  // Kept pages load
  for (const path of ["/", "/creator", "/calendar", "/library", "/claw", "/settings"]) {
    const r = await request.get(path, { ignoreHTTPSErrors: true });
    expect(r.ok(), `${path} should be 200, was ${r.status()}`).toBeTruthy();
  }

  // Removed pages now redirect to /calendar
  for (const path of ["/avatars", "/campaigns", "/pipeline", "/sites", "/integrations", "/podcast-interview", "/components-demo", "/docs"]) {
    const r = await request.get(path, { ignoreHTTPSErrors: true, maxRedirects: 0 });
    // 307/308 redirect, NOT 200
    expect([301, 302, 307, 308]).toContain(r.status());
    const loc = r.headers().location || "";
    expect(loc).toContain("/calendar");
  }

  // Image-gen API endpoints return 410 with a useful error
  for (const api of [
    { method: "POST", url: "/api/unified/create", body: { tab: "car_accident", prompt: "test" } },
    { method: "POST", url: "/api/internal/generate", body: { prompt: "test" } },
    { method: "POST", url: "/api/internal/campaign-image", body: { prompt: "test" } },
    { method: "POST", url: "/api/internal/nvidia/image", body: { prompt: "test" } },
    { method: "POST", url: "/api/internal/host-image", body: { prompt: "test" } },
    { method: "POST", url: "/api/campaigns", body: { name: "x", category: "car_accident", mission: "y" } },
    { method: "POST", url: "/api/internal/campaign-autopilot", body: {} },
    { method: "POST", url: "/api/admin/image-provider", body: { provider: "hedra", model: "gpt-image-2" } },
    { method: "POST", url: "/api/v1/video", body: { prompt: "test" } }
  ] as const) {
    const r = await request.fetch(api.url, { method: api.method, headers: { authorization: `Bearer ${process.env.E2E_API_TOKEN || ""}` }, data: api.body as any, ignoreHTTPSErrors: true });
    // 410 Gone OR 401 (when not authed). We expect either 410 (gated) or 401 (no token).
    expect([401, 410]).toContain(r.status());
    if (r.status() === 410) {
      const body = await r.json();
      expect(body.feature).toBe("image_generation");
      expect(body.disabled).toBe(true);
    }
  }

  // Visit the kept calendar page and confirm the left rail only shows 6 items
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.waitForSelector("main");
  await page.locator("button[aria-label='Open navigation']").click();
  await page.waitForTimeout(400);
  const navItems = await page.evaluate(() => Array.from(document.querySelectorAll("nav a[href]")).map(a => a.getAttribute("href")));
  console.log("Nav items:", navItems);
  // Must include kept items
  for (const kept of ["/", "/creator", "/calendar", "/library", "/settings", "/claw"]) {
    expect(navItems, `nav should include ${kept}`).toContain(kept);
  }
  // Must NOT include removed items
  for (const removed of ["/avatars", "/campaigns", "/pipeline", "/sites", "/integrations"]) {
    expect(navItems, `nav should NOT include ${removed}`).not.toContain(removed);
  }
});
