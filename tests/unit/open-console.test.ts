import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GET as computerGet } from "../../app/api/computer/route.ts";
import { GET as forgeGet } from "../../app/api/forge/route.ts";
import { GET as nvidiaGet } from "../../app/api/admin/nvidia/keys/route.ts";
import { GET as suggestionsGet } from "../../app/api/claw/suggestions/route.ts";
import { GET as conversationsGet } from "../../app/api/claw/conversations/route.ts";
import { GET as bosGet } from "../../app/api/memory/bos/route.ts";
import { GET as mcpGet } from "../../app/api/mcp/status/route.ts";
import { POST as spawnPost } from "../../app/api/agents/spawn/route.ts";
import { IN_APP_AION_BASE_URL } from "../../lib/claw/aion.ts";

const root = join(import.meta.dirname, "../..");

describe("open console — no login wall", () => {
  it("does not ship /login, AuthGuard, or admin session routes", () => {
    assert.equal(existsSync(join(root, "app/login/page.tsx")), false);
    assert.equal(existsSync(join(root, "app/api/admin/login/route.ts")), false);
    assert.equal(existsSync(join(root, "app/api/admin/logout/route.ts")), false);
    assert.equal(existsSync(join(root, "app/api/admin/session/route.ts")), false);
    assert.equal(existsSync(join(root, "components/auth-guard.tsx")), false);
    assert.equal(existsSync(join(root, "lib/auth.ts")), true);
  });

  it("does not export a password or session gate from lib/auth", async () => {
    const auth = await import("../../lib/auth.ts");
    assert.equal("requireAdmin" in auth, false);
    assert.equal("verifyAdminPassword" in auth, false);
    assert.equal("authorizeAdmin" in auth, false);
    assert.equal(typeof auth.createOAuthState, "function");
    assert.equal(typeof auth.verifyOAuthState, "function");
  });

  it("Claw / Computer / Forge / Brain proxy routes do not return 401", async () => {
    const computer = await computerGet();
    assert.notEqual(computer.status, 401);

    const forge = await forgeGet();
    assert.notEqual(forge.status, 401);

    const nvidia = await nvidiaGet();
    assert.notEqual(nvidia.status, 401);

    const suggestions = await suggestionsGet();
    assert.equal(suggestions.status, 200);

    const conversations = await conversationsGet();
    assert.equal(conversations.status, 200);

    const bos = await bosGet(new Request("http://local/api/memory/bos?q=Trinity"));
    assert.notEqual(bos.status, 401);

    const mcp = await mcpGet();
    assert.notEqual(mcp.status, 401);

    const spawn = await spawnPost(new Request("http://local/api/agents/spawn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "search" }),
    }));
    assert.notEqual(spawn.status, 401);
  });

  it("defaults Brain to the in-app service, not the shared DigitalOcean hostname", () => {
    assert.equal(IN_APP_AION_BASE_URL, "http://aion-brain:10000");
    assert.match(IN_APP_AION_BASE_URL, /^http:\/\/aion-brain/);
    assert.doesNotMatch(IN_APP_AION_BASE_URL, /ondigitalocean\.app/);
  });
});
