import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

/**
 * Verifies Claw's creator_upload_video tool is wired correctly in the chat
 * UI, replacing the retired Creator tab (code-level only, per operator
 * request 2026-08-28). The real handler — attaching a file via Upload
 * files, then calling the tool, ending up with real scheduled_posts rows —
 * is exercised directly against the real code in this change's review; see
 * tests/e2e/creator-real-file.spec.ts for the real end-to-end API contract
 * this tool now shares.
 */
async function stubConvo(page: import("@playwright/test").Page, id: string, finalMessage: string) {
  let sent = false;
  await page.route("**/api/claw/conversations", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ conversation: { id, title: "New thread", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] }) });
  });
  await page.route(`**/api/claw/conversations/${id}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      conversation: { id, title: "New thread" },
      messages: sent ? [
        { id: "m1", role: "user", content: "Schedule the video I just attached as a Reel and Story" },
        { id: "m2", role: "assistant", content: finalMessage }
      ] : []
    })
  }));
  await page.route("**/api/claw/files**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [{ id: "f-video-1", name: "car-crash.mp4", mime: "video/mp4", size: 2_600_000, url: "/api/claw/files/f-video-1/file" }] }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { id: "f-video-1", name: "car-crash.mp4", mime: "video/mp4", size: 2_600_000, url: "/api/claw/files/f-video-1/file" } }) });
  });
  return { markSent: () => { sent = true; } };
}

test("Claw schedules an attached video via creator_upload_video", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "Scheduled car-crash.mp4 as reel + story.";
  const convo = await stubConvo(page, "c-creator-ok", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c-creator-ok", model: "nvidia/nemotron-3.5-lightning-30b-a3b" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "creator_upload_video", args: { fileIds: ["f-video-1"], subject: "Got in a car crash", formats: "reel,story" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "creator_upload_video", ok: true, preview: "1 uploaded, 0 failed" })}\n\ndata: ${JSON.stringify({ type: "token", text: finalMessage })}\n\ndata: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Schedule the video I just attached as a Reel and Story");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Did creator_upload_video")).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});

test("Claw surfaces a creator_upload_video failure as text when the file id is unknown", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "I couldn't find that attached file — try uploading it again.";
  const convo = await stubConvo(page, "c-creator-fail", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c-creator-fail", model: "nvidia/nemotron-3.5-lightning-30b-a3b" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "creator_upload_video", args: { fileIds: ["missing-file"] } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "creator_upload_video", ok: false, preview: "No such Claw file — attach it with Upload files first" })}\n\ndata: ${JSON.stringify({ type: "token", text: finalMessage })}\n\ndata: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Schedule the video I just attached");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Failed creator_upload_video")).toBeVisible();
  await expect(page.getByText(/No such Claw file/)).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});
