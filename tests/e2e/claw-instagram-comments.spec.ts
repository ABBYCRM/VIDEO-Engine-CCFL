import { expect, test, type Page } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

const MEDIA_ID = "18131725150628755";

async function stubThread(page: Page, id: string, finalMessage: string) {
  let sent = false;
  await page.route("**/api/claw/conversations", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ conversation: { id, title: "New thread", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] }) });
  });
  await page.route(`**/api/claw/conversations/${id}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      conversation: { id, title: "Read today’s Instagram comments" },
      messages: sent ? [
        { id: `${id}-user`, role: "user", content: "Read today’s Instagram comments" },
        { id: `${id}-assistant`, role: "assistant", content: finalMessage }
      ] : []
    })
  }));
  await page.route("**/api/claw/files**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ files: [] })
  }));
  return { markSent: () => { sent = true; } };
}

test("Claw reads Instagram comments with a real media id through the Composio fallback", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const finalMessage = "Graph was not configured, so I used Composio. One new comment today: ‘Need help’ from @viewer.";
  const thread = await stubThread(page, "c-comments-ok", finalMessage);

  await page.route("**/api/claw/chat", async (route) => {
    expect(await route.request().postDataJSON()).toMatchObject({
      conversationId: "c-comments-ok",
      text: "Read today’s Instagram comments",
      fileIds: []
    });
    thread.markSent();
    const events = [
      { type: "meta", conversationId: "c-comments-ok", model: "meta/llama-3.2-11b-vision-instruct" },
      { type: "tool_start", name: "ig_list_media", args: { limit: 12 } },
      { type: "tool_end", name: "ig_list_media", ok: true, via: "composio", preview: JSON.stringify({ via: "composio", media: [{ id: MEDIA_ID, caption: "Wet floor safety" }] }) },
      { type: "tool_start", name: "ig_get_comments", args: { mediaId: MEDIA_ID } },
      { type: "tool_end", name: "ig_get_comments", ok: true, via: "composio", preview: JSON.stringify({ data: [{ id: "comment-1", text: "Need help", username: "viewer" }] }) },
      { type: "token", text: finalMessage },
      { type: "done", assistant: finalMessage }
    ];
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
    });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Read today’s Instagram comments");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Did ig_list_media")).toBeVisible();
  await expect(page.getByText("Did ig_get_comments")).toBeVisible();
  await expect(page.getByText("via composio", { exact: true })).toHaveCount(2);
  await expect(page.getByText(MEDIA_ID, { exact: false })).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
  const composer = page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…");
  await expect(composer).toBeEnabled();
  await composer.fill("Try again");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("Claw keeps working and gives actionable guidance for Meta code 100/subcode 33", async ({ page }) => {
  await stubAuthenticatedSession(page);
  const guidance = "Meta denied access to this media (code 100, subcode 33). Reconnect Instagram in Settings using the Business/Creator account that owns the media and grant instagram_basic plus instagram_manage_comments.";
  const finalMessage = `I could list the media, but Meta denied comment access. ${guidance}`;
  const thread = await stubThread(page, "c-comments-denied", finalMessage);

  await page.route("**/api/claw/chat", async (route) => {
    thread.markSent();
    const events = [
      { type: "meta", conversationId: "c-comments-denied", model: "meta/llama-3.2-11b-vision-instruct" },
      { type: "tool_start", name: "ig_list_media", args: { limit: 12 } },
      { type: "tool_end", name: "ig_list_media", ok: true, via: "composio", preview: JSON.stringify({ media: [{ id: MEDIA_ID }] }) },
      { type: "tool_start", name: "ig_get_comments", args: { mediaId: MEDIA_ID } },
      { type: "tool_end", name: "ig_get_comments", ok: false, preview: `ig_get_comments failed on both paths. Graph (instagram-mcp): access token is not configured. Composio: ${guidance}` },
      { type: "token", text: finalMessage },
      { type: "done", assistant: finalMessage }
    ];
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
  });

  await page.goto("/claw");
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Read today’s Instagram comments");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Did ig_list_media")).toBeVisible();
  await expect(page.getByText("Failed ig_get_comments")).toBeVisible();
  await expect(page.getByText(/Meta denied access to this media/).first()).toBeVisible();
  await expect(page.getByText(/Reconnect Instagram in Settings/).first()).toBeVisible();
  await expect(page.getByText(finalMessage)).toBeVisible();
  const composer = page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…");
  await expect(composer).toBeEnabled();
  await composer.fill("Try again");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});
