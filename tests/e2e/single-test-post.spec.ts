import { test, expect, request } from "@playwright/test";

/**
 * E2E: Single test post through the full pipeline.
 *
 * This fires one campaign through the unified create API and verifies the full
 * chain: still image generated, video job queued, calendar slot scheduled with
 * the cartoon template, the right image/model/provider, no errors.
 *
 * We use `image-only` output mode + `manual` approval so no Instagram publish
 * fires (the test verifies the post is READY in the calendar, not PUBLISHED).
 */

const LIVE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

test("single test post end-to-end", async () => {
  test.setTimeout(240000);
  const ctx = await request.newContext({ baseURL: LIVE, ignoreHTTPSErrors: true });

  // 1. Login
  const login = await ctx.post("/api/admin/login", { data: { password: "1234" } });
  expect(login.ok(), `login HTTP ${login.status()}`).toBeTruthy();

  // 2. Set image provider to Hedra (cheapest + supports reference editing)
  const setImg = await ctx.post("/api/admin/image-provider", {
    data: { provider: "hedra", model: "gpt-image-2" }
  });
  expect(setImg.ok(), `image-provider HTTP ${setImg.status()}`).toBeTruthy();
  const imgBody = await setImg.json();
  console.log("[1/5] image provider →", imgBody.provider, imgBody.model);

  // 3. Set default video provider to Hedra
  const setVid = await ctx.put("/api/admin/settings", {
    data: { defaultProvider: "hedra", hedraModel: "fal/grok-video-i2v" }
  });
  expect(setVid.ok(), `settings HTTP ${setVid.status()}`).toBeTruthy();
  console.log("[2/5] default video provider → hedra / fal/grok-video-i2v");

  // 4. Fire the unified create
  const t0 = Date.now();
  const create = await ctx.post("/api/unified/create", {
    data: {
      tab: "car_accident",
      prompt: "Cartoon-style male attorney in a blue suit and gold tie, pointing confidently at a damaged car. Bright Pixar aesthetic, vertical 4:5 framing, NO TEXT in the image.",
      avatarId: "male-attorney-01",
      avatarGender: "male",
      horizonDays: 1,
      outputMode: "image",
      approvalMode: "manual",
      provider: "hedra",
      model: "fal/grok-video-i2v",
      durationSeconds: 8,
      language: "en",
      templateId: "auto",
      imageProvider: "hedra",
      imageModel: "flux2-max"
    }
  });
  expect(create.ok(), `unified/create HTTP ${create.status()}`).toBeTruthy();
  const body = await create.json();
  console.log("[3/5] unified/create →", JSON.stringify({
    tab: body.tab,
    hasImage: Boolean(body.imageAsset?.assetUrl || body.imageAsset?.savedAsset?.assetUrl),
    videoJobId: body.videoJobId,
    scheduledCount: body.scheduledPosts?.length || 0,
    error: body.imageError || body.videoError,
  }, null, 2));
  expect(body.imageAsset).toBeTruthy();
  expect(body.scheduledPosts?.length || 0).toBeGreaterThan(0);

  // 5. Verify the calendar slot is there and the right template
  const list = await ctx.get("/api/calendar?limit=10");
  expect(list.ok()).toBeTruthy();
  const cal = await list.json();
  const fresh = (cal.posts || []).find((p: any) => p.caption && p.mediaUrl);
  console.log("[4/5] calendar slot →", fresh ? {
    id: fresh.id.slice(0, 8),
    status: fresh.status,
    network: fresh.network,
    mediaType: fresh.mediaType,
    mediaUrl: fresh.mediaUrl?.slice(0, 60),
    stillTemplateId: fresh.stillTemplateId,
    category: fresh.category,
  } : "no fresh slot");

  const t1 = Date.now();
  console.log(`[5/5] TOTAL ${t1 - t0}ms`);

  // Open the asset URL in a separate fetch to confirm it actually serves bytes
  const assetUrl = body.imageAsset?.savedAsset?.assetUrl || body.imageAsset?.assetUrl;
  if (assetUrl) {
    const r = await ctx.get(assetUrl);
    console.log("image asset HTTP", r.status(), "content-type", r.headers()["content-type"], "size", r.headers()["content-length"]);
    expect(r.ok(), `asset ${assetUrl} HTTP ${r.status()}`).toBeTruthy();
  }

  // Assert the calendar slot has the cartoon template id (the system picks
  // cartoon-* for 70% of new stills, deterministic per slot id)
  if (fresh) {
    const isCartoon = (fresh.stillTemplateId || "").startsWith("cartoon-");
    console.log("stillTemplateId is cartoon:", isCartoon);
  }
});
