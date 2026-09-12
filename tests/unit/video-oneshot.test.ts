import assert from "node:assert/strict";
import test from "node:test";
import { parseGenerationBody } from "../../lib/request.ts";
import { compileVeoPrompt } from "../../lib/prompt-compiler.ts";
import { campaignTemplates } from "../../lib/prompts.ts";

test("parseGenerationBody locks the one-shot 8-second contract", () => {
  const parsed = parseGenerationBody({
    category: "car_accident",
    provider: "veo",
    mission: "Aftermath awareness shot",
    durationSeconds: 30,
  });
  assert.equal(parsed.durationSeconds, 8);
  assert.equal(parsed.category, "car_accident");
  assert.equal(parsed.provider, "veo");
});

test("parseGenerationBody rejects invalid categories and providers", () => {
  assert.throws(() => parseGenerationBody({ category: "montage" }), /Invalid category/);
  assert.throws(() => parseGenerationBody({ category: "ugc", provider: "runway" }), /Invalid provider/);
  assert.throws(() => parseGenerationBody({ category: "ugc", provider: "a2e", model: "video-twin" }), /Video Twin/);
});

test("every campaign category compiles ONE CONTINUOUS SHOT ONLY under the prompt cap", () => {
  for (const category of Object.keys(campaignTemplates) as Array<keyof typeof campaignTemplates>) {
    const prompt = compileVeoPrompt({
      category,
      mission: "Document the aftermath without gore",
      script: "I did not know what to record after the crash.",
    });
    assert.match(prompt, /ONE CONTINUOUS SHOT ONLY/);
    assert.match(prompt, /exactly 8 seconds/);
    assert.ok(prompt.length <= 3401);
  }
});
