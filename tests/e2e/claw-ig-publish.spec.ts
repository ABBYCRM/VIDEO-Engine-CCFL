import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

/**
 * Verifies Claw's ig_publish tool is wired correctly end to end in the chat
 * UI: a successful publish reports which path was used (Composio primary vs
 * direct Graph fallback), and a clean failure (e.g. nothing configured) surfaces as text,
 * never a crash. No real Instagram call is made anywhere in this suite -
 * see the code-level verification of lib/instagram-publish.ts's own
 * "neither Graph nor Composio configured" branch, exercised directly
 * against the real handler during this change's review.
 */
async function stubConvo(page: import("@playwright/test").Page, id: string, finalMessage: string) {
  let sent = false;
  await page.route("**/api/claw/conversations", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ conversation: { id, title: "New thread", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] }) });
  });
  // The real backend persists the assistant's final message and this GET
  // re-fetches it once "done" clears the live-streaming buffer - a mock
  // that always returns messages: [] would make that text vanish, which is
  // a mock-fidelity bug, not a real Claw bug (see claw.spec.ts's identical
  // fix for the same root cause).
  await page.route(`**/api/claw/conversations/${id}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      conversation: { id, title: "New thread" },
      messages: sent ? [
        { id: "m1", role: "user", content: "Post the latest reel to Instagram" },
        { id: "m2", role: "assistant", content: finalMessage }
      ] : []
    })
  }));
  await page.route("**/api/claw/files**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) }));
  return {
    markSent: () => { sent = true; }
  };
}

test("Claw reports a successful ig_publish and which path published it", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "Published to Instagram via instagram-mcp.";
  const convo = await stubConvo(page, "c-ig-ok", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c-ig-ok", model: "nvidia/nemotron-3.5-lightning-30b-a3b" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "ig_publish", args: { mediaUrl: "/api/library/assets/asset-1/file", caption: "Test caption", postType: "feed" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "ig_publish", ok: true, via: "instagram-mcp", preview: "mediaId: 17999999999" })}\n\ndata: ${JSON.stringify({ type: "token", text: finalMessage })}\n\ndata: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Post the latest reel to Instagram");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Did ig_publish")).toBeVisible();
  await expect(page.getByText("via instagram-mcp", { exact: true })).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});

test("Claw surfaces an ig_publish failure as text, not a crash, when nothing is configured", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "I couldn't publish - Instagram isn't connected yet.";
  const convo = await stubConvo(page, "c-ig-fail", finalMessage);
  await page.route("**/api/claw/chat", async (route) => {
    convo.markSent();
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c-ig-fail", model: "nvidia/nemotron-3.5-lightning-30b-a3b" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "ig_publish", args: { mediaUrl: "/api/library/assets/asset-1/file", caption: "Test caption", postType: "feed" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "ig_publish", ok: false, preview: "Instagram is not configured. Connect Composio Instagram, or save Graph credentials in Settings." })}\n\ndata: ${JSON.stringify({ type: "token", text: finalMessage })}\n\ndata: ${JSON.stringify({ type: "done", assistant: finalMessage })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Post the latest reel to Instagram");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Failed ig_publish")).toBeVisible();
  await expect(page.getByText(/Instagram is not configured/)).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
});
