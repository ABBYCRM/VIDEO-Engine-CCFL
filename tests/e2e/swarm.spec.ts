import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Swarm console is a first-class operator surface", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/swarm", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          live: true,
          cap: 1,
          gateway: { name: "bitdeer", available: true, note: "Bitdeer Mistral + GLM" },
        }),
      });
    }
    const body = route.request().postDataJSON() as { op?: string };
    if (body.op === "status") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          live: true,
          cap: 1,
          gateway: { name: "bitdeer", available: true, note: "Bitdeer Mistral + GLM" },
        }),
      });
    }
    if (body.op === "create" || body.op === "run") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          run: {
            id: "run_e2e",
            objective: "Compare SQLite vs Postgres",
            status: "planning",
            leaderAnswer: null,
            error: null,
            providerNote: "Bitdeer",
            usage: { promptTokens: 0, completionTokens: 0, calls: 0 },
            limits: { maxAgents: 4 },
            tasks: [
              { id: "research-a", role: "researcher", objective: "Support", dependsOn: [], state: "ready", result: null, error: null },
              { id: "synth", role: "synthesizer", objective: "Lead", dependsOn: ["research-a"], state: "pending", result: null, error: null },
            ],
            events: [{ id: "e1", type: "run.created", at: Date.now(), taskId: null }],
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/swarm");
  await expect(page.getByRole("heading", { name: /Claw Swarm/i })).toBeVisible();
  await expect(page.getByText(/Computer and Forge keep their own Chrome/i)).toBeVisible();
  await page.getByRole("button", { name: /Run swarm/i }).click();
  await expect(page.getByText(/research-a/i)).toBeVisible();
});
