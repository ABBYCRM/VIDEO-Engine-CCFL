import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db.ts";
import {
  applyKeyPoolMutation,
  jsonContainsSecret,
  publicKeyPoolView,
  readKeyPoolPublic,
} from "../../lib/nvidia/keys-admin.ts";

const previousEnc = process.env.APP_ENCRYPTION_KEY;
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const MOCK_A = "nvapi-mock-key-alpha-0001";
const MOCK_B = "nvapi-mock-key-bravo-0002";

describe("nvidia key pool is never echoed", () => {
  after(() => {
    db.prepare("DELETE FROM settings WHERE key IN ('nvidia_api_key','nvidia_api_keys')").run();
    if (previousEnc === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousEnc;
  });

  it("public view is count-only and contains no key material", () => {
    const view = publicKeyPoolView([MOCK_A, MOCK_B]);
    assert.deepEqual(view, { ok: true, count: 2, configured: true });
    assert.equal(jsonContainsSecret(view, [MOCK_A, MOCK_B]), false);
    assert.equal("sample" in view, false);
    assert.equal("keys" in view, false);
  });

  it("add/remove with mock keys never returns the secret", () => {
    db.prepare("DELETE FROM settings WHERE key IN ('nvidia_api_key','nvidia_api_keys')").run();
    const added = applyKeyPoolMutation({ op: "add", key: MOCK_A });
    assert.deepEqual(added, { ok: true, count: 1, configured: true });
    assert.equal(jsonContainsSecret(added, [MOCK_A]), false);

    const added2 = applyKeyPoolMutation({ op: "add", key: MOCK_B });
    assert.deepEqual(added2, { ok: true, count: 2, configured: true });
    assert.equal(jsonContainsSecret(added2, [MOCK_A, MOCK_B]), false);

    const dup = applyKeyPoolMutation({ op: "add", key: MOCK_A });
    assert.equal("error" in dup, true);

    const removed = applyKeyPoolMutation({ op: "remove", index: 1 });
    assert.deepEqual(removed, { ok: true, count: 1, configured: true });
    assert.equal(jsonContainsSecret(removed, [MOCK_A, MOCK_B]), false);

    const read = readKeyPoolPublic();
    assert.deepEqual(read, { ok: true, count: 1, configured: true });
    assert.equal(jsonContainsSecret(read, [MOCK_A, MOCK_B]), false);
  });
});
