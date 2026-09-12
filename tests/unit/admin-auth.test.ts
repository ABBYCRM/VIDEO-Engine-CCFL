import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db } from "../../lib/db.ts";
import {
  authorizeAdmin,
  createSessionValue,
  parseSessionCookie,
  requireAdmin,
  verifyAdminPassword,
} from "../../lib/auth.ts";
import { POST as loginPost } from "../../app/api/admin/login/route.ts";
import { GET as computerGet, POST as computerPost } from "../../app/api/computer/route.ts";
import { GET as forgeGet, POST as forgePost } from "../../app/api/forge/route.ts";
import { GET as nvidiaGet, POST as nvidiaPost } from "../../app/api/admin/nvidia/keys/route.ts";
import { POST as clawChatPost } from "../../app/api/claw/chat/route.ts";

const SESSION_SECRET = "e2e-session-secret-that-is-long-enough-for-tests-123456";
const ADMIN_PASSWORD = "e2e-local-only";
const previousSecret = process.env.SESSION_SECRET;
const previousPassword = process.env.ADMIN_PASSWORD;

process.env.SESSION_SECRET = SESSION_SECRET;
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

describe("admin auth", () => {
  after(() => {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  });

  it("rejects missing, forged, and expired session cookies", () => {
    assert.equal(parseSessionCookie(null), null);
    assert.equal(parseSessionCookie(""), null);
    assert.equal(parseSessionCookie("not-a-jwt"), null);
    assert.equal(parseSessionCookie("aaa.bbb"), null);

    const token = createSessionValue(crypto.randomUUID());
    const [payload] = token.split(".");
    assert.equal(parseSessionCookie(`${payload}.forgedsignaturevalue`), null);

    const expired = createSessionValue(crypto.randomUUID(), -60_000);
    assert.equal(parseSessionCookie(expired), null);
  });

  it("accepts a signed session cookie and rejects an unknown sid", async () => {
    const sid = crypto.randomUUID();
    const token = createSessionValue(sid);
    const claims = parseSessionCookie(token);
    assert.ok(claims);
    assert.equal(claims.sid, sid);
    assert.equal(await authorizeAdmin({ cookie: token }), false);
  });

  it("authorizes an active session row and a hashed ve_live_ token", async () => {
    const sid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    db.prepare("INSERT INTO sessions(id, user_label, expires_at) VALUES(?,?,?)").run(sid, "admin", expiresAt);
    assert.equal(await authorizeAdmin({ cookie: createSessionValue(sid) }), true);

    db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(sid);
    assert.equal(await authorizeAdmin({ cookie: createSessionValue(sid) }), false);

    const raw = `ve_live_${crypto.randomBytes(24).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const tokenId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO api_tokens(id, name, token_hash, token_prefix) VALUES(?,?,?,?)"
    ).run(tokenId, "auth-test", hash, raw.slice(0, 12));
    assert.equal(await authorizeAdmin({ authorization: `Bearer ${raw}` }), true);
    assert.equal(await authorizeAdmin({ authorization: "Bearer ve_live_not-in-db-xxxxxxxxxxxx" }), false);
    db.prepare("DELETE FROM api_tokens WHERE id=?").run(tokenId);
  });

  it("does not accept the retired unlock code and requires ADMIN_PASSWORD", () => {
    assert.equal(verifyAdminPassword("1234").ok, false);
    assert.equal(verifyAdminPassword("wrong-password").ok, false);
    assert.equal(verifyAdminPassword(ADMIN_PASSWORD).ok, true);

    const previous = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    const missing = verifyAdminPassword(ADMIN_PASSWORD);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 503);
    process.env.ADMIN_PASSWORD = previous;
  });

  it("login fails without a password and with a wrong password", async () => {
    const missing = await loginPost(new Request("http://local/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    assert.equal(missing.status, 400);

    const wrong = await loginPost(new Request("http://local/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    }));
    assert.equal(wrong.status, 401);
    const wrongBody = await wrong.json() as { error?: string };
    assert.equal(wrongBody.error, "Invalid password");
  });

  it("login mints a signed claw_session cookie for ADMIN_PASSWORD", async () => {
    const res = await loginPost(new Request("http://local/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    }));
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie") || "";
    assert.match(cookie, /claw_session=/);
    const value = cookie.match(/claw_session=([^;]+)/)?.[1];
    assert.ok(value);
    const claims = parseSessionCookie(decodeURIComponent(value));
    assert.ok(claims);
    assert.equal(await authorizeAdmin({ cookie: decodeURIComponent(value) }), true);
  });

  it("requireAdmin is false outside a Next request", async () => {
    assert.equal(await requireAdmin(), false);
  });

  it("unauthenticated Computer / Forge / NVIDIA / Claw chat requests are 401", async () => {
    const computer = await computerGet();
    assert.equal(computer.status, 401);
    assert.deepEqual(await computer.json(), { error: "Unauthorized" });

    const computerWrite = await computerPost(new Request("http://local/api/computer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "boot" }),
    }));
    assert.equal(computerWrite.status, 401);

    const forge = await forgeGet();
    assert.equal(forge.status, 401);
    const forgeWrite = await forgePost(new Request("http://local/api/forge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create" }),
    }));
    assert.equal(forgeWrite.status, 401);

    const nvidia = await nvidiaGet();
    assert.equal(nvidia.status, 401);
    const nvidiaWrite = await nvidiaPost(new Request("http://local/api/admin/nvidia/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys: ["nvapi-mock-key-value"] }),
    }));
    assert.equal(nvidiaWrite.status, 401);

    const chat = await clawChatPost(new Request("http://local/api/claw/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    }));
    assert.equal(chat.status, 401);
  });
});
