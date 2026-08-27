import assert from "node:assert/strict";
import test from "node:test";
import { validateSteelUrl } from "../../lib/steel.ts";

test("validateSteelUrl accepts public HTTP(S) URLs", () => {
  assert.equal(validateSteelUrl("https://example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(validateSteelUrl("http://example.com"), "http://example.com/");
});

test("validateSteelUrl rejects credentials and non-web protocols", () => {
  assert.throws(() => validateSteelUrl("https://user:pass@example.com"), /credentials/);
  assert.throws(() => validateSteelUrl("file:///etc/passwd"), /http or https/);
});

test("validateSteelUrl rejects local and private network targets", () => {
  for (const url of [
    "http://localhost:3000",
    "http://service.internal",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1",
    "http://[::1]"
  ]) {
    assert.throws(() => validateSteelUrl(url), /local and private/);
  }
});
