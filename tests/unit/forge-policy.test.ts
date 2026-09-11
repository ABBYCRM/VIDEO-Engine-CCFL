import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampDelay,
  detectForgeHandoff,
  evaluateForgeOp,
  guardPublicUrl,
  parseCreateInput,
  parseStealth,
} from "../../lib/forge/policy.ts";

describe("forge policy", () => {
  it("refuses CAPTCHA farms, token injection, and proxy rotation", () => {
    assert.equal(evaluateForgeOp("solve_captcha").ok, false);
    assert.equal(evaluateForgeOp("inject_token").ok, false);
    assert.equal(evaluateForgeOp("scrape", { solveCaptcha: true }).ok, false);
    assert.equal(evaluateForgeOp("create", { proxyRotate: true }).ok, false);
    assert.equal(evaluateForgeOp("scrape").ok, true);
  });

  it("blocks private and metadata URLs", () => {
    assert.equal(guardPublicUrl("http://127.0.0.1/secret").ok, false);
    assert.equal(guardPublicUrl("http://169.254.169.254/latest/meta-data").ok, false);
    assert.equal(guardPublicUrl("https://example.com").ok, true);
    const fix = guardPublicUrl("http://127.0.0.1:8080/fixtures/probe.html", { allowPreviewFixtures: true });
    assert.equal(fix.ok, true);
  });

  it("detects captcha copy for human handoff", () => {
    const hits = detectForgeHandoff({
      url: "https://html.duckduckgo.com/html/",
      title: "Pardon Our Interruption",
      bodyText: "Select all squares containing a duck. Unusual traffic from your computer.",
    });
    assert.ok(hits.includes("captcha"));
  });

  it("does not hand off the owned fingerprint lab page", () => {
    const hits = detectForgeHandoff({
      url: "http://127.0.0.1:8080/fixtures/probe.html",
      title: "Claw Forge fingerprint lab",
      bodyText: "Owned page for Claw Forge. This is not a CAPTCHA and not a third-party challenge.",
    });
    assert.equal(hits.includes("captcha"), false);
  });

  it("parses create input and clamps delay", () => {
    assert.equal(parseStealth("lab"), "lab");
    assert.equal(parseStealth("ghost"), "coherence");
    const created = parseCreateInput({ width: 4000, block_ads: true });
    assert.equal(created.width, 1920);
    assert.equal(created.blockAds, true);
    assert.equal(clampDelay(99_000), 10_000);
    assert.equal(clampDelay(-4), 0);
  });
});
