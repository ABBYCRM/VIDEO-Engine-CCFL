import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  authorizeFromParts,
  createAdminSession,
  requireAdmin,
  revokeAdminSession,
  SESSION_COOKIE,
  verifyAdminPassword
} from "../../lib/auth.ts";
import { POST as loginPost } from "../../app/api/admin/login/route.ts";
import { GET as nvidiaKeysGet } from "../../app/api/admin/nvidia/keys/route.ts";
import { GET as suggestionsGet } from "../../app/api/claw/suggestions/route.ts";
import { POST as launchPost } from "../../app/api/cursor/launch/route.ts";
import { GET as computerGet } from "../../app/api/computer/route.ts";
import { GET as forgeGet } from "../../app/api/forge/route.ts";
import { GET as swarmGet } from "../../app/api/swarm/route.ts";

const SECRET = "e2e-session-secret-that-is-long-enough-for-tests-123456";
const PASSWORD = "e2e-local-only";

function ensureEnv() {
  process.env.SESSION_SECRET = SECRET;
  process.env.ADMIN_PASSWORD = PASSWORD;
}

function authedRequest(url: string, init: RequestInit = {}) {
  const { token } = createAdminSession();
  const headers = new Headers(init.headers);
  headers.set("Cookie", `${SESSION_COOKIE}=${token}`);
  return new Request(url, { ...init, headers });
}

before(() => {
  ensureEnv();
});

describe("requireAdmin is not a no-op", () => {
  it("source does not hardcode unlock 1234 or constant true", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");
    assert.doesNotMatch(src, /ADMIN_UNLOCK_CODE/);
    assert.match(src, /WEAK_PASSWORDS/);
    assert.match(src, /authorizeFromParts/);
    assert.match(src, /ve_live_/);
    assert.doesNotMatch(
      src,
      /export async function requireAdmin[\s\S]{0,200}\{\s*return true;?\s*\}/
    );
  });

  it("empty request is denied", async () => {
    assert.equal(authorizeFromParts({}), false);
    assert.equal(await requireAdmin(new Request("http://local/")), false);
  });

  it("forged cookie and leftover 1234 password fail", async () => {
    assert.equal(verifyAdminPassword("1234"), false);
    assert.equal(verifyAdminPassword("change-me"), false);
    assert.equal(authorizeFromParts({ sessionCookie: "not-a-jwt" }), false);
    const login = await loginPost(new Request("http://local/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "1234" })
    }));
    assert.equal(login.status, 401);
  });

  it("valid password mints a JWT session that requireAdmin accepts", async () => {
    assert.equal(verifyAdminPassword(PASSWORD), true);
    const { token } = createAdminSession();
    assert.equal(authorizeFromParts({ sessionCookie: token }), true);
    const req = new Request("http://local/", { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(await requireAdmin(req), true);
    revokeAdminSession(token);
    assert.equal(authorizeFromParts({ sessionCookie: token }), false);
  });
});

describe("control APIs reject anonymous callers", () => {
  const anon = () => new Request("http://local/x");

  it("NVIDIA keys never return a prefix sample", async () => {
    const denied = await nvidiaKeysGet(anon());
    assert.equal(denied.status, 401);
    const allowed = await nvidiaKeysGet(authedRequest("http://local/api/admin/nvidia/keys"));
    const body = await allowed.json() as { sample?: string; count?: number; configured?: boolean };
    assert.equal(allowed.status, 200);
    assert.equal("sample" in body, false);
    assert.equal(typeof body.count, "number");
    assert.equal(typeof body.configured, "boolean");
  });

  it("suggestions, cursor, computer, forge, swarm return 401 without a session", async () => {
    assert.equal((await suggestionsGet(anon())).status, 401);
    assert.equal((await launchPost(anon())).status, 401);
    assert.equal((await computerGet(anon())).status, 401);
    assert.equal((await forgeGet(anon())).status, 401);
    assert.equal((await swarmGet(anon())).status, 401);
  });
});
