import { test, expect } from "@playwright/test";

test.use({
  ignoreHTTPSErrors: true,
  viewport: { width: 412, height: 915 }
});

test("inspect mobile create page", async ({ page, request }) => {
  test.setTimeout(60000);

  // Login
  const loginRes = await request.post("/api/admin/login", {
    data: { password: process.env.ADMIN_PASSWORD || "e2e-local-only" },
    ignoreHTTPSErrors: true
  });
  expect(loginRes.ok()).toBeTruthy();
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);

  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector("h1", { timeout: 10000 });

  // Inspect at 412x915 (Pixel 7)
  const data = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    const h1 = document.querySelector("h1");
    const header = document.querySelector("header");
    const tabsContainer = document.querySelector("main .grid");
    const tabButtons = Array.from(document.querySelectorAll("main .grid > button"));

    function rect(el: Element | null) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docW: html.clientWidth,
      docScrollW: html.scrollWidth,
      bodyW: body.clientWidth,
      bodyScrollW: body.scrollWidth,
      main: rect(main),
      h1: { text: h1?.textContent, rect: rect(h1) },
      header: rect(header),
      tabsContainer: rect(tabsContainer),
      tabCount: tabButtons.length,
      firstTab: rect(tabButtons[0]),
      lastTab: tabButtons.length > 0 ? rect(tabButtons[tabButtons.length - 1]) : null,
      allTabWidths: tabButtons.map(b => rect(b)?.w),
      docHasHorizScroll: html.scrollWidth > html.clientWidth,
    };
  });

  console.log("\n=== MOBILE VIEWPORT 412x915 (Pixel 7) ===");
  console.log(JSON.stringify(data, null, 2));

  await page.screenshot({ path: "tests/e2e/screenshots/inspect-mobile-412.png", fullPage: false });

  // Test 360 (Galaxy S8)
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(800);
  const d360 = await page.evaluate(() => {
    const html = document.documentElement;
    const main = document.querySelector("main");
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollW: html.scrollWidth,
      mainW: main?.getBoundingClientRect().width,
      hasHorizScroll: html.scrollWidth > html.clientWidth
    };
  });
  console.log("\n=== VIEWPORT 360x640 (Galaxy S8) ===");
  console.log(JSON.stringify(d360, null, 2));
  await page.screenshot({ path: "tests/e2e/screenshots/inspect-mobile-360.png", fullPage: false });

  // Test 414 (iPhone 11 Pro Max)
  await page.setViewportSize({ width: 414, height: 896 });
  await page.waitForTimeout(800);
  const d414 = await page.evaluate(() => {
    const html = document.documentElement;
    const main = document.querySelector("main");
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      docScrollW: html.scrollWidth,
      mainW: main?.getBoundingClientRect().width,
      hasHorizScroll: html.scrollWidth > html.clientWidth
    };
  });
  console.log("\n=== VIEWPORT 414x896 (iPhone 11 Pro Max) ===");
  console.log(JSON.stringify(d414, null, 2));
  await page.screenshot({ path: "tests/e2e/screenshots/inspect-mobile-414.png", fullPage: false });
});
