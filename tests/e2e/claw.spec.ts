import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Claw is the operator chat with thread/file controls, model picker, and tool execution", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/claw/model", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      model: "zai-org/GLM-5",
      envOverridden: false,
      models: [{ id: "zai-org/GLM-5", label: "GLM-5", capabilities: ["chat"], contextWindow: 131072, costTier: "low", notes: "", emitsReasoning: false }]
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
    const body = `data: ${JSON.stringify({ type: "meta", conversationId: "c1", model: "zai-org/GLM-5" })}\n\ndata: ${JSON.stringify({ type: "self_state", health: "HEALTHY", issue: "INFORMATION_GAP", phase: "ACTION", progress: 0.2, strategy: "observe-then-act", blockers: [], step: "act", toolsRun: 0 })}\n\ndata: ${JSON.stringify({ type: "tool_start", name: "steel_scrape", args: { url: "https://example.com" } })}\n\ndata: ${JSON.stringify({ type: "tool_end", name: "steel_scrape", ok: true, via: "steel.dev", preview: "Example Domain" })}\n\ndata: ${JSON.stringify({ type: "self_state", health: "HEALTHY", issue: "NONE", phase: "TERMINATION_CHECK", progress: 0.6, strategy: "observe-then-act", blockers: [], step: "verify", toolsRun: 1 })}\n\ndata: ${JSON.stringify({ type: "token", text: "Example Domain is a placeholder page." })}\n\ndata: ${JSON.stringify({ type: "done", assistant: "Example Domain is a placeholder page." })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto("/claw");
  await expect(page.getByText(/operator/i).first()).toBeVisible();
  await expect(page.getByText(/I choose the agent/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Research a public URL with Steel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach files" })).toBeVisible();
  const sendBtn = page.getByRole("button", { name: "Send message" });
  await expect(sendBtn).toBeVisible();
  const sendSize = await sendBtn.boundingBox();
  expect(sendSize?.width ?? 0).toBeGreaterThan(28);
  expect(sendSize?.height ?? 0).toBeGreaterThan(28);

  await expect(page.getByRole("button", { name: "Choose model" })).toContainText("GLM-5");

  const box = page.getByPlaceholder("What do you need?");
  await box.fill("Summarize https://example.com");
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0);

  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await expect(page.getByText(/Working|Thinking/i).first()).toBeVisible();
  await expect(page.getByText("steel_scrape")).toBeVisible();
  await expect(page.getByText("steel.dev")).toBeVisible();
  await expect(page.getByText("HEALTHY").first()).toBeVisible();
  await expect(page.getByText("Example Domain is a placeholder page.")).toBeVisible();
});

test("Composer attaches zip and other file types", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/claw/model", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      model: "zai-org/GLM-5",
      envOverridden: false,
      models: [{ id: "zai-org/GLM-5", label: "GLM-5", capabilities: ["chat"], contextWindow: 131072, costTier: "low", notes: "", emitsReasoning: false }]
    })
  }));
  await page.route("**/api/claw/suggestions", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, suggestions: [] })
  }));
  await page.route("**/api/claw/conversations", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] })
  }));
  await page.route("**/api/claw/files**", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: [] }) });
    }
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ file: { id: "z1", name: "bundle.zip", mime: "application/zip", size: 120, url: "/api/claw/files/z1/file" } })
    });
  });

  await page.goto("/claw");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "bundle.zip", mimeType: "application/zip", buffer: Buffer.from("PK\u0005\u0006" + "\u0000".repeat(18)) });
  await expect(page.getByText("bundle.zip").first()).toBeVisible();
});
