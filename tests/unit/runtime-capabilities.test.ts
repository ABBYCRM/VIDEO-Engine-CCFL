import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CLAW_TOOLS } from "../../lib/claw/tools.ts";
import { sanitizeUserVisibleMessage, toUserVisibleAssistant } from "../../lib/claw/user-visible.ts";

const root = join(import.meta.dirname, "../..");

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("real runtimes survive collapse + open console", () => {
  it("Computer / Composio / Cursor tools are registered and not stubs", () => {
    const names = new Set(CLAW_TOOLS.map((t) => t.name));
    for (const name of [
      "computer_open", "computer_click", "computer_type", "computer_handoff",
      "composio_health", "composio_list_tools", "composio_action",
      "cursor_launch", "cursor_status", "cursor_reply", "cursor_cancel",
      "aion_execute", "aion_agents", "bos_memory", "routines", "mcp_status",
      "trinity_decide", "claw_dispatch", "steel_scrape",
      "forge_session", "swarm_spawn", "swarm_wait",
    ]) {
      assert.equal(names.has(name), true, name);
    }
    const tools = src("lib/claw/tools.ts");
    assert.match(tools, /from "@\/lib\/browser-computer"/);
    assert.match(tools, /composioAction/);
    assert.match(tools, /runCursorControl/);
    assert.doesNotMatch(tools, /not implemented|TODO stub|fake computer|fake cursor/i);
  });

  it("Computer token stays in the DigitalOcean orchestrator only", () => {
    assert.equal(existsSync(join(root, "lib/browser-computer/digitalocean.ts")), true);
    const orch = src("lib/browser-computer/digitalocean.ts");
    assert.match(orch, /DIGITALOCEAN_TOKEN/);
    const tools = src("lib/claw/tools.ts");
    assert.doesNotMatch(tools, /DIGITALOCEAN_TOKEN/);
  });

  it("Cursor stays Brain-owned; CCFL only proxies /api/cursor", () => {
    const control = src("lib/cursor/control.ts");
    assert.match(control, /aionCursorLaunch/);
    assert.match(control, /Do not call api\.cursor\.com/);
    assert.doesNotMatch(control, /fetch\([^)]*api\.cursor\.com/);
    const aion = src("lib/claw/aion.ts");
    assert.match(aion, /\/api\/cursor\/launch/);
    assert.match(aion, /X-AION-Key/);
    assert.doesNotMatch(aion, /fetch\([^)]*api\.cursor\.com/);
    assert.equal(existsSync(join(root, "services/aion-brain/lib/cursor_cloud.js")), true);
    const brainCursor = src("services/aion-brain/lib/cursor_cloud.js");
    assert.match(brainCursor, /CURSOR_API_KEY/);
  });

  it("Composio uses the live client, not a local fake", () => {
    assert.equal(existsSync(join(root, "lib/composio/client.ts")), true);
    const client = src("lib/composio/client.ts");
    assert.match(client, /@composio\/core|composio/i);
    assert.doesNotMatch(client, /return \{ ok: true, fake: true \}/);
  });

  it("assistant-visible chat still strips SELF_STATE / control-loop dumps", () => {
    const dump = [
      "SELF_STATE: {\"health\":\"HEALTHY\",\"free_energy\":0.2}",
      "SELF_OBSERVATION",
      "{\"trinity\":\"HOLD\",\"cycles\":[],\"self_state\":{\"health\":\"LOOP_DETECTED\"}}",
      "previous_tool_results: [{\"name\":\"aion_execute\"}]",
    ].join("\n");
    assert.equal(sanitizeUserVisibleMessage(dump), "");
    const mixed = "The title is Example Domain.\nSELF_STATE health=HEALTHY\nAsk if you want more.";
    const cleaned = toUserVisibleAssistant(mixed);
    assert.match(cleaned, /Example Domain/);
    assert.doesNotMatch(cleaned, /SELF_STATE|free_energy|trinity/i);
    const runtime = src("lib/claw/runtime.ts");
    assert.match(runtime, /toUserVisibleAssistant/);
    assert.match(runtime, /sanitizeUserVisibleMessage/);
    assert.match(runtime, /emitUserToken/);
    const consoleSrc = src("components/claw-console.tsx");
    assert.doesNotMatch(consoleSrc, /AuthGuard/);
    assert.match(consoleSrc, /sanitizeUserVisibleMessage/);
  });

  it("Brain assistant_text sanitizer is in the absorbed runtime", () => {
    const text = src("services/aion-brain/lib/assistant_text.js");
    assert.match(text, /sanitizeAssistantText/);
    assert.match(text, /looksLikeInternalDump|INTERNAL/);
    const server = src("services/aion-brain/server.js");
    assert.match(server, /sanitizeAssistantText/);
  });

  it("HTTP routes for spawn / BOS / routines / MCP / Computer / Cursor / Composio remain", () => {
    for (const rel of [
      "app/api/agents/spawn/route.ts",
      "app/api/agents/[id]/route.ts",
      "app/api/memory/bos/route.ts",
      "app/api/routines/route.ts",
      "app/api/routines/[name]/run/route.ts",
      "app/api/mcp/status/route.ts",
      "app/api/decision/route.ts",
      "app/api/computer/route.ts",
      "app/api/cursor/launch/route.ts",
      "app/api/integrations/composio/route.ts",
      "app/api/forge/route.ts",
      "app/api/swarm/route.ts",
      "app/api/claw/suggestions/route.ts",
      "lib/browser-computer/digitalocean.ts",
      "lib/composio/client.ts",
      "lib/cursor/control.ts",
    ]) {
      assert.equal(existsSync(join(root, rel)), true, rel);
    }
  });

  it("21st Grok shell is the chat chrome, not a stub runtime", () => {
    const consoleSrc = src("components/claw-console.tsx");
    assert.match(consoleSrc, /from "@\/components\/ui\/input-bar"/);
    assert.match(consoleSrc, /from "@\/components\/ui\/agent-chat"/);
    assert.match(consoleSrc, /from "@\/components\/ui\/sidebar"/);
    assert.match(src("components/ui/agent-chat.tsx"), /max-w-\[640px\]/);
    assert.match(src("components/ui/input-bar.tsx"), /max-w-\[640px\]/);
    assert.equal(existsSync(join(root, "components/ui/ai-message.tsx")), true);
    assert.match(consoleSrc, /ComputerDock/);
    assert.match(consoleSrc, /ForgeConsole/);
    assert.match(consoleSrc, /SwarmConsole/);
    assert.doesNotMatch(consoleSrc, /AuthGuard/);
    assert.equal(existsSync(join(root, "components/ui/sidebar.tsx")), true);
    assert.equal(existsSync(join(root, "app/login/page.tsx")), false);
  });

  it("DO spec binds existing secret names onto video-engine-ccfl", () => {
    const spec = src(".do/app.yaml");
    assert.match(spec, /b5f68e19-fbfa-469d-acea-1d4278e8b475/);
    assert.match(spec, /video-engine-ccfl-jpd37\.ondigitalocean\.app/);
    for (const key of [
      "COMPOSIO_API_KEY", "STEEL_API_KEY", "CURSOR_API_KEY",
      "AION_API_KEY", "AION_API_KEYS", "BITDEER_API_KEY",
      "DIGITALOCEAN_TOKEN", "SESSION_SECRET",
    ]) {
      assert.match(spec, new RegExp(`key: ${key}`), key);
    }
    assert.doesNotMatch(spec, /ADMIN_PASSWORD/);
    assert.match(spec, /\$\{aion-brain\.PRIVATE_URL\}/);
  });
});
