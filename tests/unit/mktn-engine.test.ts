import assert from "node:assert/strict";
import test from "node:test";
import { marketingTerms } from "../../lib/mktn/catalog.ts";
import { buildMarketingPlan } from "../../lib/mktn/engine.ts";
import { explainAllTerms, findTerms } from "../../lib/mktn/usage.ts";

test("MKTN catalog has unique canonical names and resolved usage for every term", () => {
  assert.ok(marketingTerms.length >= 300);
  const names = marketingTerms.map((term) => term.name.toLocaleLowerCase("en-US"));
  assert.equal(new Set(names).size, names.length);
  for (const guide of explainAllTerms()) {
    assert.ok(guide.when.length > 20, `${guide.name} missing when`);
    assert.ok(guide.where.length > 20, `${guide.name} missing where`);
    assert.ok(guide.how.length > 20, `${guide.name} missing how`);
    assert.ok(guide.why.length > 20, `${guide.name} missing why`);
  }
});

test("MKTN resolves common acronyms", () => {
  assert.equal(findTerms("VSL")[0]?.name, "Video Sales Letter");
  assert.equal(findTerms("CAC")[0]?.name, "Customer acquisition cost");
  assert.equal(findTerms("JTBD")[0]?.name, "Jobs to Be Done");
});

test("MKTN builds a guarded, stage-specific plan", () => {
  const plan = buildMarketingPlan({ product: "Case intake", audience: "personal-injury firms", goal: "leads", funnelStage: "consideration", channels: ["Meta Ads"] });
  assert.equal(plan.steps.length, 5);
  assert.match(plan.objective, /Case intake/);
  assert.ok(plan.steps.some((step) => step.terms.includes("Lead magnet")));
  assert.ok(plan.guardrails.some((rule) => /settlements/i.test(rule)));
});

test("MKTN rejects incomplete briefs", () => {
  assert.throws(() => buildMarketingPlan({ product: "", audience: "x", goal: "sales", funnelStage: "conversion", channels: ["Meta"] }), /product is required/);
});
