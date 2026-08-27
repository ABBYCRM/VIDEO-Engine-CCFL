import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_FOOTER, applyBrandFooter } from "../../lib/brand-footer.ts";

test("BRAND_FOOTER is exactly the operator's locked three lines", () => {
  assert.equal(BRAND_FOOTER,
    "Visit CaseClosedFL.com or call (561) 566-1360 for a free consultation, no pressure.\n" +
    "General information only—not legal advice.\n" +
    "#Florida #SlipAndFall #CaseClosedFL"
  );
});

test("applyBrandFooter appends the footer to a bare caption", () => {
  const out = applyBrandFooter("🚨 Don't let this happen to you.");
  assert.ok(out.includes("🚨 Don't let this happen to you."), "keeps the operator's body");
  assert.ok(out.endsWith("#Florida #SlipAndFall #CaseClosedFL"), "ends with the locked hashtag line");
  assert.ok(out.includes("Visit CaseClosedFL.com or call (561) 566-1360 for a free consultation, no pressure."), "includes the URL+phone CTA line");
  assert.ok(out.includes("General information only—not legal advice."), "includes the disclaimer line");
});

test("applyBrandFooter is idempotent (does not double the footer)", () => {
  const once = applyBrandFooter("Hello");
  const twice = applyBrandFooter(once);
  assert.equal(once, twice, "calling twice does not duplicate the footer");
});

test("applyBrandFooter does not over-write a caption that already contains the closer", () => {
  const good = "🚨 Don't let this happen.\n\nVisit CaseClosedFL.com or call (561) 566-1360 for a free consultation, no pressure.\nGeneral information only—not legal advice.\n#Florida #CarAccident #CaseClosedFL";
  const out = applyBrandFooter(good);
  assert.equal(out, good, "leaves a well-formed caption alone");
});

test("empty caption returns just the footer", () => {
  assert.equal(applyBrandFooter(""), BRAND_FOOTER);
  assert.equal(applyBrandFooter("   \n  "), BRAND_FOOTER);
});

test("Instagram length cap (4900 chars) is respected", () => {
  const body = "x".repeat(10_000);
  const out = applyBrandFooter(body);
  assert.ok(out.length <= 4900, `output length ${out.length} should be <= 4900`);
});
