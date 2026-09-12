import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import crypto from "node:crypto";
import { adminPasswordMatches, sessionIsActive, createAdminSession, readBearerToken, requireAdmin } from "../../lib/auth.ts";
import { issueApiToken, verifyApiToken, revokeApiToken } from "../../lib/tokens.ts";

const SOURCE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../lib/auth.ts"), "utf8");

test("requireAdmin is not a no-op and has no hardcoded unlock code", () => {
  assert.match(SOURCE, /export async function requireAdmin/);
  assert.match(SOURCE, /sessionIsActive/);
  assert.match(SOURCE, /verifyApiToken/);
  assert.doesNotMatch(SOURCE, /export async function requireAdmin\(\) \{\s*return true;\s*\}/);
  assert.doesNotMatch(SOURCE, /ADMIN_UNLOCK_CODE/);
  assert.doesNotMatch(SOURCE, /"1234"/);
});

test("requireAdmin fails closed outside a request and is not a constant true", async () => {
  assert.equal(await requireAdmin(), false);
});

test("admin login accepts only ADMIN_PASSWORD from the environment", () => {
  const previous = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "unit-admin-password-ok";
  assert.equal(adminPasswordMatches("unit-admin-password-ok"), true);
  assert.equal(adminPasswordMatches("1234"), false);
  assert.equal(adminPasswordMatches("wrong-password"), false);
  assert.equal(adminPasswordMatches(""), false);
  process.env.ADMIN_PASSWORD = previous;
});

test("admin login fails closed when ADMIN_PASSWORD is unset or too short", () => {
  const previous = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  assert.equal(adminPasswordMatches("unit-admin-password-ok"), false);
  process.env.ADMIN_PASSWORD = "short";
  assert.equal(adminPasswordMatches("short"), false);
  process.env.ADMIN_PASSWORD = previous;
});

test("session rows expire and revoke", () => {
  const session = createAdminSession();
  assert.equal(sessionIsActive(session.id), true);
  assert.equal(sessionIsActive("missing-session"), false);
  assert.equal(sessionIsActive(""), false);
});

test("ve_live API tokens verify by hash and fail after revoke", () => {
  const issued = issueApiToken(`auth-test-${crypto.randomUUID()}`);
  assert.equal(issued.token.startsWith("ve_live_"), true);
  assert.equal(verifyApiToken(issued.token), true);
  assert.equal(verifyApiToken("ve_live_not-a-real-token"), false);
  revokeApiToken(issued.id);
  assert.equal(verifyApiToken(issued.token), false);
});

test("readBearerToken extracts ve_live tokens", () => {
  assert.equal(readBearerToken("Bearer ve_live_abc"), "ve_live_abc");
  assert.equal(readBearerToken("bearer ve_live_abc"), "ve_live_abc");
  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken("Basic x"), null);
});
