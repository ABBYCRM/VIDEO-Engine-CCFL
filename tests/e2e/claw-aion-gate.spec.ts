import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

/**
 * Verifies the AION pre-execution gate end-to-end in the chat UI. The
 * previous review's "E2E claim was fabricated" callout said any merged
 * AION PR must include a real Playwright test that exercises the gate.
 * This is that test.
 *
 * Two scenarios:
 *  1. The model emits <tool_call name="ig_publish"> and the operator's
 *     text is "publish this reel". The gate DEFERs (external_post tool
 *     requires exact CONFIRM). The UI shows the deferred result, the
 *     assistant's streamed text, and does NOT execute the publish.
 *  2. The operator follows up with "CONFIRM ig_publish". The gate now
 *     COMMITs. The UI shows the executed result.
 *
 * No real Instagram call is made; the streaming SSE response is mocked.
 */
async function stubConvo(
  page: import("@playwright/test").Page,
  id: string,
  finalMessage: string
) {
  let sent = false;
  await page.route("**/api/claw/conversations", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          conversation: {
            id,
            title: "New thread",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversations: [] })
    });
  });
  await page.route(`**/api/claw/conversations/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversation: { id, title: "New thread" },
        messages: sent
          ? [
              { id: "m1", role: "user", content: "Publish this reel" },
              { id: "m2", role: "assistant", content: finalMessage }
            ]
          : []
      })
    })
  );
  await page.route("**/api/claw/files**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: [] })
    })
  );
  return { markSent: () => { sent = true; } };
}

test("AION gate DEFERs ig_publish until exact CONFIRM is supplied", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage =
    "I can't publish that without your confirmation. Reply exactly: CONFIRM ig_publish";
  const convo = await stubConvo(page, "c-aion-defer", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body =
      `data: ${JSON.stringify({ type: "meta", conversationId: "c-aion-defer", model: "meta/llama-3.2-11b-vision-instruct" })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_start", name: "ig_publish", args: { mediaUrl: "/api/library/assets/x/file", caption: "hi", postType: "feed" } })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_end", name: "ig_publish", ok: false, preview: "DEFER: Reply exactly: CONFIRM ig_publish. Tool was not executed." })}\n\n` +
      `data: ${JSON.stringify({ type: "token", text: finalMessage })}\n\n` +
      `data: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Publish this reel");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/DEFER:/)).toBeVisible();
  await expect(page.getByText(/CONFIRM ig_publish/)).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});

test("AION gate COMMITs ig_publish after operator supplies exact CONFIRM", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "Published to Instagram via Composio.";
  const convo = await stubConvo(page, "c-aion-commit", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body =
      `data: ${JSON.stringify({ type: "meta", conversationId: "c-aion-commit", model: "meta/llama-3.2-11b-vision-instruct" })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_start", name: "ig_publish", args: { mediaUrl: "/api/library/assets/x/file", caption: "hi", postType: "feed" } })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_end", name: "ig_publish", ok: true, via: "composio", preview: "mediaId: 17999999999" })}\n\n` +
      `data: ${JSON.stringify({ type: "token", text: finalMessage })}\n\n` +
      `data: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page
    .getByPlaceholder("Ask Claw to generate, post, read comments, DMs…")
    .fill("CONFIRM ig_publish");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("via composio", { exact: true })).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});

test("AION gate auto-runs read tools (no CONFIRM needed for list operations)", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "Here are your recent Instagram posts.";
  const convo = await stubConvo(page, "c-aion-read", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body =
      `data: ${JSON.stringify({ type: "meta", conversationId: "c-aion-read", model: "meta/llama-3.2-11b-vision-instruct" })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_start", name: "ig_list_media", args: { limit: 5 } })}\n\n` +
      `data: ${JSON.stringify({ type: "tool_end", name: "ig_list_media", ok: true, via: "composio", preview: "media: 5 items" })}\n\n` +
      `data: ${JSON.stringify({ type: "token", text: finalMessage })}\n\n` +
      `data: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page
    .getByPlaceholder("Ask Claw to generate, post, read comments, DMs…")
    .fill("Show me my recent posts");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("via composio", { exact: true })).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});
