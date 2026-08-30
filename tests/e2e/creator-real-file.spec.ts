import { test, expect } from "@playwright/test";

/**
 * Operator-reported bug reproduction, kept alive at the API level after the
 * Creator page was retired from the UI (2026-08-28, code-level only — see
 * app-shell.tsx/next.config.ts). The original flow was:
 *   1. Open /creator on the phone
 *   2. Tap "Tap to pick a video", choose a 2.6MB .mp4
 *   3. Write a subject
 *   4. Tap "Generate with NVIDIA" to get a caption
 *   5. Tap "Upload + schedule"
 *   6. See "Error: Failed to fetch" or the retry message
 *
 * The page is gone, but /api/creator/upload (now backed by
 * lib/creator-upload.ts's uploadAndScheduleCreatorVideo(), the same
 * function Claw's creator_upload_video tool calls) is still exactly the
 * code that broke. This test drives it directly with a real-ish 2.6MB file
 * to confirm the fix still holds for the exact file size the operator was
 * uploading.
 *
 * Uses a real browser login + page.evaluate(fetch(...)) rather than the
 * bare `request` fixture — same pattern as integration.spec.ts's real
 * composition-endpoint test. A real admin_session cookie is `secure` on
 * this standalone production build, which the bare API-only request
 * context won't reliably carry across an unrelated multipart POST; a real
 * browser session does.
 */
test("creator upload API: 2.6MB real file schedules successfully", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/login");
  await page.getByPlaceholder("Admin password").fill(process.env.ADMIN_PASSWORD || "e2e-local-only");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the shared app shell (present on every authenticated page,
  // e.g. components/app-shell.tsx's "Sign out" control) rather than a
  // specific page's heading -- this test only needs an authenticated
  // browser session for the upload API calls below, and doesn't care
  // which page a real login redirects to. Asserting on "Content Calendar"
  // specifically broke when the post-login landing page changed to /claw;
  // this makes the login check independent of that route.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15000 });

  const response = await page.evaluate(async () => {
    // 2.6MB file (matches the operator's clip) — built in-browser so the
    // bytes never cross the Node <-> browser evaluate() boundary. Only the
    // size and mime type matter to this pipeline, not real MP4 validity, so
    // a minimal ftyp-box-shaped prefix is enough.
    const ftyp = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // size, "ftyp", "isom"
    const bytes = new Uint8Array(ftyp.length + 2_600_000);
    bytes.set(ftyp, 0);
    const form = new FormData();
    form.append("file", new File([bytes], "car-crash.mp4", { type: "video/mp4" }));
    form.append("title", "E2E car-crash real file");
    form.append("formats", "reel,story");
    form.append("subject", "Got in a car crash");
    form.append("caption", "Test caption — not published (autoPost left off)");
    form.append("autoPost", "false");
    const r = await fetch("/api/creator/upload", { method: "POST", body: form });
    return { status: r.status, body: await r.json() };
  });

  expect(response.status, `upload HTTP ${response.status}`).toBe(200);
  const body = response.body;
  expect(body.ok, "body.ok should be true").toBe(true);
  expect(body.scheduledPostIds?.length, "should have 2 scheduled post ids (reel + story)").toBe(2);
  // Confirm the file was actually uploaded (not empty body)
  expect(body.bytes, "file bytes should be ~2.6MB").toBeGreaterThan(2_500_000);

  const postsResponse = await page.evaluate(async () => {
    const r = await fetch("/api/creator/posts");
    return { status: r.status, body: await r.json() };
  });
  expect(postsResponse.status).toBe(200);
  const ours = (postsResponse.body.posts || []).filter((p: any) => body.scheduledPostIds.includes(p.id));
  expect(ours.length, "both scheduled rows should be listed").toBe(2);

  // Clean up
  const ids = body.scheduledPostIds.join(",");
  const del = await page.evaluate(async (ids: string) => {
    const r = await fetch(`/api/creator/posts?ids=${ids}`, { method: "DELETE" });
    return r.status;
  }, ids);
  expect(del).toBe(200);
});
