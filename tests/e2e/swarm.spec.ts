import { expect, test } from "@playwright/test";
import { stubAuthenticatedSession } from "./helpers";

test("Swarm console spawns an ephemeral worker without a prefab picker", async ({ page }) => {
  await stubAuthenticatedSession(page);
  await page.route("**/api/swarm", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          live: true,
          cap: 2,
          gateway: { name: "bitdeer", available: true, note: "Bitdeer Mistral + GLM" },
        }),
      });
    }
    const body = route.request().postDataJSON() as { op?: string; goal?: string };
    if (body.op === "status" || body.op === "list") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          live: true,
          cap: 2,
          gateway: { name: "bitdeer", available: true, note: "Bitdeer Mistral + GLM" },
          runs: [],
        }),
      });
    }
    if (body.op === "spawn") {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          taskId: "wrk_e2e",
          brief: { label: "ad-hoc", tools: ["search", "fetch"], successCriteria: ["Named URLs"], ephemeral: true, preset: null, runner: "local" },
          run: {
            id: "run_e2e",
            objective: body.goal || "spawned",
            status: "running",
            leaderAnswer: null,
            error: null,
            providerNote: "Bitdeer",
            usage: { promptTokens: 0, completionTokens: 0, calls: 0 },
            limits: { maxAgents: 8 },
            tasks: [
              {
                id: "wrk_e2e",
                role: "worker",
                objective: body.goal || "spawned",
                dependsOn: [],
                state: "running",
                result: null,
                error: null,
                brief: { label: "ad-hoc", successCriteria: ["Named URLs"] },
              },
            ],
            events: [{ id: "e1", type: "task.spawned.adhoc", at: Date.now(), taskId: "wrk_e2e" }],
          },
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
            id: "run_prefab",
            objective: "Compare SQLite vs Postgres",
            status: "planning",
            leaderAnswer: null,
            error: null,
            providerNote: "Bitdeer",
            usage: { promptTokens: 0, completionTokens: 0, calls: 0 },
            limits: { maxAgents: 4 },
            tasks: [
              { id: "research-a", role: "researcher", objective: "Support", dependsOn: [], state: "ready", result: null, error: null },
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
  await expect(page.getByRole("button", { name: /Spawn worker/i })).toBeVisible();
  await page.getByRole("button", { name: /Spawn worker/i }).click();
  await expect(page.getByText("ad-hoc · wrk_e2e")).toBeVisible();
});
