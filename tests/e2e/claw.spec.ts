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
  await page.route("**/api/claw/conversations/c1", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversation: { id: "c1", title: "New thread" }, messages: [] }) }));
  await page.route("**/api/claw/files**", route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { id: "f1", name: "brief.txt", mime: "text/plain", size: 12, url: "/api/claw/files/f1/file" } }) });
  });
  await page.route("**/api/claw/chat", async route => {
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c1", model: "nvidia/nvidia-nemotron-nano-9b-v2" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "steel_scrape", args: { url: "https://example.com" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "steel_scrape", ok: true, via: "steel.dev", preview: "Example Domain" })}\n\ndata: ${JSON.stringify({ type: "token", text: "Graph is primary. Composio is fallback." })}\n\ndata: ${JSON.stringify({ type: "done", assistant: "Graph is primary. Composio is fallback." })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await expect(page.getByRole("link", { name: "Claw" })).toBeVisible();
  await expect(page.getByText("Talk to Claw")).toBeVisible();
  await expect(page.getByText(/research the public web with Steel/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Read today’s Instagram comments");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Did steel_scrape")).toBeVisible();
  await expect(page.getByText("via steel.dev")).toBeVisible();
  await expect(page.getByText("Graph is primary. Composio is fallback.")).toBeVisible();
});
