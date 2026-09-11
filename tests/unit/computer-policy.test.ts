import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPageForHandoff, evaluateAction, isSafePublicUrl, safeSessionFilename } from "../../lib/browser-computer/policy.ts";

describe("computer policy", () => {
  it("allows public https and fixture loopback", () => {
    assert.equal(isSafePublicUrl("https://example.com/path").ok, true);
    const fix = isSafePublicUrl("http://127.0.0.1:8080/fixtures/captcha.html", { allowPreviewFixtures: true });
    assert.equal(fix.ok, true);
  });

  it("blocks private networks and metadata", () => {
    assert.equal(isSafePublicUrl("http://192.168.1.4/").ok, false);
    assert.equal(isSafePublicUrl("http://10.0.0.8/").ok, false);
    assert.equal(isSafePublicUrl("http://169.254.169.254/latest/meta-data").ok, false);
    assert.equal(isSafePublicUrl("file:///etc/passwd").ok, false);
  });

  it("requires human for secret-looking type", () => {
    const r = evaluateAction({ type: "type", text: "123456" });
    assert.equal(r.decision, "HUMAN_REQUIRED");
    assert.equal(r.reason, "password");
  });

  it("detects captcha copy", () => {
    const hits = classifyPageForHandoff({
      url: "https://example.com",
      title: "Verify",
      bodyText: "Select all images with traffic lights. I'm not a robot.",
      passwordFieldVisible: false,
      captchaFrame: true
    });
    assert.ok(hits.includes("captcha"));
  });

  it("allows click, search, and rejects path traversal uploads", () => {
    assert.equal(evaluateAction({ type: "click", text: "Search" }).decision, "ALLOW");
    assert.equal(evaluateAction({ type: "search", text: "DigitalOcean" }).decision, "ALLOW");
    assert.equal(safeSessionFilename("../etc/passwd").ok, false);
    assert.equal(evaluateAction({ type: "upload", filename: "../../id_rsa" }).decision, "DENY");
  });
});
