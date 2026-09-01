import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Claw is the operator chat with thread/file controls, model picker, and tool execution", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/claw/model", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      model: "meta/llama-3.2-11b-vision-instruct",
      envOverridden: false,
      models: [{ id: "meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision Instruct (default)", capabilities: ["chat", "vision"], contextWindow: 131072, costTier: "low", notes: "", emitsReasoning: false }]
    })
  }));
  await page.route("**/api/claw/suggestions", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, suggestions: [{ label: "Research a public URL with Steel", prompt: "Use steel_scrape on https://example.com", source: "tool" }] })
  }));
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
        { id: "m1", role: "user", content: "Summarize https://example.com" },
        { id: "m2", role: "assistant", content: "Example Domain is a placeholder page." }
      ] : []
    })
  }));
  await page.route("**/api/claw/files**", route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ file: { id: "f1", name: "brief.txt", mime: "text/plain", size: 12, url: "/api/claw/files/f1/file" } }) });
  });
  await page.route("**/api/claw/chat", async route => {
    sent = true;
    // Deliberate delay so the busy-but-not-yet-streaming window (the AILoader
    // "Thinking" indicator) is actually observable instead of racing past it.
    await new Promise((r) => setTimeout(r, 300));
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c1", model: "meta/llama-3.2-11b-vision-instruct" })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "steel_scrape", args: { url: "https://example.com" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "steel_scrape", ok: true, via: "steel.dev", preview: "Example Domain" })}\n\ndata: ${JSON.stringify({ type: "token", text: "Example Domain is a placeholder page." })}\n\ndata: ${JSON.stringify({ type: "done", assistant: "Example Domain is a placeholder page." })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await expect(page.getByRole("link", { name: "Claw", exact: true })).toBeVisible();
  await expect(page.getByText("Talk to Claw")).toBeVisible();
  await expect(page.getByRole("button", { name: "Research a public URL with Steel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();

  // Model picker reflects the mocked NVIDIA catalog, not a placeholder/demo model.
  await expect(page.locator("[data-slot='model-selector-trigger']")).toContainText("Llama 3.2 11B Vision Instruct");

  await page.getByPlaceholder("Ask Claw to generate, post, read comments, DMs…").fill("Summarize https://example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByText("Thinking").first()).toBeVisible();
  await expect(page.getByText("Did steel_scrape")).toBeVisible();
  await expect(page.getByText("via steel.dev")).toBeVisible();
  await expect(page.getByText("Example Domain is a placeholder page.")).toBeVisible();
  await expect(page.getByText("Thinking")).toHaveCount(0);
});
