import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STEALTH_CONTRACT, coherenceInitScript, describeStealth, initScriptFor, labProfileInitScript } from "../../lib/forge/stealth.ts";

describe("forge stealth contract", () => {
  it("never rewrites webdriver or farms captchas", () => {
    assert.equal(STEALTH_CONTRACT.rewritesWebdriver, false);
    assert.equal(STEALTH_CONTRACT.farmsCaptcha, false);
    assert.equal(STEALTH_CONTRACT.rotatesResidentialProxies, false);
    assert.equal(STEALTH_CONTRACT.spoofsCanvas, false);
    assert.equal(STEALTH_CONTRACT.spoofsAudio, false);
    assert.equal(STEALTH_CONTRACT.spoofsWebRTC, false);
  });

  it("coherence strips cdc_ globals only", () => {
    const script = coherenceInitScript();
    assert.match(script, /cdc_/);
    assert.doesNotMatch(script, /webdriver/);
    assert.doesNotMatch(script, /hardwareConcurrency/);
  });

  it("lab pins CPU/RAM and copies them into Workers without touching webdriver", () => {
    const script = labProfileInitScript();
    assert.match(script, /hardwareConcurrency/);
    assert.match(script, /deviceMemory/);
    assert.match(script, /Worker/);
    assert.doesNotMatch(script, /webdriver/);
    assert.doesNotMatch(script, /toDataURL/);
  });

  it("initScriptFor maps modes", () => {
    assert.equal(initScriptFor("off"), null);
    assert.ok(initScriptFor("coherence"));
    assert.ok(initScriptFor("lab"));
    assert.match(describeStealth("lab"), /webdriver stays real/i);
  });
});
