import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectBrowser } from "../../lib/forge/detector.ts";
import type { BrowserFingerprint } from "../../lib/forge/types.ts";

function base(over: Partial<BrowserFingerprint> = {}): BrowserFingerprint {
  return {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
    webdriver: false,
    platform: "Linux x86_64",
    vendor: "Google Inc.",
    languages: ["en-US", "en"],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    cookieEnabled: true,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
    window: { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800, devicePixelRatio: 1 },
    capabilities: { webRTC: true, worker: true, serviceWorker: true, touchEvent: false },
    fonts: { arial: true, times: true, courier: true },
    webgl: {
      vendor: "WebKit",
      renderer: "WebKit WebGL",
      unmaskedVendor: "Google Inc. (Intel)",
      unmaskedRenderer: "ANGLE (Intel, Mesa)",
      maxTextureSize: 16384,
      extensions: ["WEBGL_debug_renderer_info"],
    },
    canvasSha256: "abc",
    audio: { available: true, sampleRate: 48000 },
    timezone: "UTC",
    ...over,
  };
}

describe("forge detector", () => {
  it("scores webdriver and HeadlessChrome independently", () => {
    const r = inspectBrowser(
      base({
        webdriver: true,
        userAgent: "Mozilla/5.0 HeadlessChrome/128.0.0.0 Safari/537.36",
      }),
    );
    assert.equal(r.score, 4);
    assert.ok(r.findings.some((f) => f.signal === "webdriver"));
    assert.ok(r.findings.some((f) => f.signal === "userAgent"));
  });

  it("does not treat a clean fingerprint as human-certified", () => {
    const r = inspectBrowser(base());
    assert.equal(r.score, 0);
    assert.match(r.note, /not a CAPTCHA bypass/i);
  });

  it("flags implausible CPU and missing WebGL", () => {
    const r = inspectBrowser(base({ hardwareConcurrency: 4096, webgl: null }));
    assert.ok(r.score >= 3);
    assert.ok(r.findings.some((f) => f.signal === "hardwareConcurrency"));
    assert.ok(r.findings.some((f) => f.signal === "webgl"));
  });

  it("flags outerWidth greater than screen width", () => {
    const r = inspectBrowser(
      base({
        screen: { width: 800, height: 600, availWidth: 800, availHeight: 600, colorDepth: 24, pixelDepth: 24 },
        window: { innerWidth: 1280, innerHeight: 800, outerWidth: 1400, outerHeight: 900, devicePixelRatio: 1 },
      }),
    );
    assert.ok(r.findings.some((f) => f.signal === "geometry"));
  });
});
