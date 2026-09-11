import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPageForHandoff, evaluateAction, isSafePublicUrl, safeSessionFilename, shouldAutoHandoff } from "../../lib/browser-computer/policy.ts";

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

  it("allows typing operator-supplied passwords and OTPs", () => {
    assert.equal(evaluateAction({ type: "type", text: "123456" }).decision, "ALLOW");
    assert.equal(evaluateAction({ type: "type", text: "hunter2!" }).decision, "ALLOW");
    assert.equal(evaluateAction({ type: "fill", field: "Password", text: "hunter2!" }).decision, "ALLOW");
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
    assert.equal(shouldAutoHandoff(hits), "captcha");
  });

  it("does not auto-pause a normal login form", () => {
    const hits = classifyPageForHandoff({
      url: "https://accounts.google.com",
      title: "Sign in",
      bodyText: "Sign in to continue to Gmail. Email or phone. Password. Forgot email? Next.",
      passwordFieldVisible: true,
      captchaFrame: false,
    });
    assert.ok(hits.includes("password"));
    assert.equal(shouldAutoHandoff(hits), null);
  });

  it("allows click, search, and rejects path traversal uploads", () => {
    assert.equal(evaluateAction({ type: "click", text: "Search" }).decision, "ALLOW");
    assert.equal(evaluateAction({ type: "search", text: "DigitalOcean" }).decision, "ALLOW");
    assert.equal(safeSessionFilename("../etc/passwd").ok, false);
    assert.equal(evaluateAction({ type: "upload", filename: "../../id_rsa" }).decision, "DENY");
  });
});
