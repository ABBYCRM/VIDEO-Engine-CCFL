import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Claw is the left-nav operator chat with Grok-style thread and file controls", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/claw/conversations", async route => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ conversation: { id: "c1", title: "New thread", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] }) });
  });
  let sent = false;
  await page.route("**/api/claw/conversations/c1", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      conversation: { id: "c1", title: "New thread" },
      messages: sent ? [
        { id: "m1", role: "user", content: "Research https://example.com" },
        { id: "m2", role: "assistant", content: "Example Domain is a public documentation example." }
      ] : []
    })
  }));
  await page.route("**/api/claw/files**", route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { id: "f1", name: "brief.txt", mime: "text/plain", size: 12, url: "/api/claw/files/f1/file" } }) });
  });
  await page.route("**/api/claw/chat", async route => {
    const request = await route.request().postDataJSON();
    expect(request).toMatchObject({ conversationId: "c1", text: "Research https://example.com", fileIds: [] });
    sent = true;
    // Deliberate delay so the busy-but-not-yet-streaming window (the AILoader
    // "Thinking" indicator) is actually observable instead of racing past it.
    await new Promise((r) => setTimeout(r, 300));
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c1", model: "meta/llama-3.2-11b-vision-instruct" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "steel_scrape", args: { url: "https://example.com" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "steel_scrape", ok: true, via: "steel.dev", preview: "Example Domain" })}\n\ndata: ${JSON.stringify({ type: "token", text: "Example Domain is a public documentation example." })}\n\ndata: ${JSON.stringify({ type: "done", assistant: "Example Domain is a public documentation example." })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await expect(page.getByRole("link", { name: "Claw" })).toBeVisible();
  await expect(page.getByText("Talk to Claw")).toBeVisible();
  await expect(page.getByText(/research the public web with Steel/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Research https://example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByText("Thinking").first()).toBeVisible();
  await expect(page.getByText("Did steel_scrape")).toBeVisible();
  await expect(page.getByText("via steel.dev")).toBeVisible();
  await expect(page.getByText("Example Domain is a public documentation example.")).toBeVisible();
  await expect(page.getByText("Thinking")).toHaveCount(0);
});
