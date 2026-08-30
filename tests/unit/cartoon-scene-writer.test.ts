// tests/unit/cartoon-scene-writer.test.ts
//
// lib/cartoon-scene-writer.ts itself pulls in @/lib/nvidia/client and both
// autonomous pipelines' store modules (which import @/lib/db) — unresolvable
// under raw `node --test` (same constraint documented in
// tests/unit/aion-policy-completeness.test.ts). Its two pure helpers
// (assembleCartoonScene / summarizeCartoonScene) live in
// lib/cartoon-still-templates.ts instead, which has zero @/ imports, so they
// can be exercised directly here.

import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleCartoonScene,
  summarizeCartoonScene,
  CARTOON_TEMPLATES,
  CHARACTERS,
} from "../../lib/cartoon-still-templates.ts";

test("assembleCartoonScene wraps a bare scenario in the locked CHARACTERS/STYLE_BLOCK text, never letting the model author it", () => {
  const scene = assembleCartoonScene("A man slips on ice outside a diner.");
  assert.ok(scene.startsWith(CHARACTERS), "must start with the exact locked CHARACTERS block");
  assert.ok(scene.includes("Scene: A man slips on ice outside a diner."));
  assert.ok(scene.includes("High-end 3D animation in the style of Pixar"), "must append the locked STYLE_BLOCK");
});

test("summarizeCartoonScene extracts only the bare scenario, stripping CHARACTERS and STYLE_BLOCK boilerplate", () => {
  const variant = { scene: assembleCartoonScene("A man slips on ice outside a diner."), headline: "h", subhead: "s", cta: "c" };
  const summary = summarizeCartoonScene(variant);
  assert.equal(summary, "A man slips on ice outside a diner.");
  assert.ok(!summary.includes("INJURED WORKER"), "must not leak the locked character description into stored history");
  assert.ok(!summary.includes("Pixar"), "must not leak the locked style block into stored history");
});

test("summarizeCartoonScene round-trips every hand-authored template variant without leaking boilerplate", () => {
  for (const template of CARTOON_TEMPLATES) {
    for (const variant of template.variants) {
      const summary = summarizeCartoonScene(variant);
      assert.ok(summary.length > 0, `${template.id} variant should summarize to non-empty text`);
      assert.ok(!summary.includes("High-end 3D animation"), `${template.id} summary leaked the STYLE_BLOCK`);
    }
  }
});

test("summarizeCartoonScene truncates to 400 chars so run-history rows stay small", () => {
  const long = "x".repeat(1000);
  const variant = { scene: assembleCartoonScene(long), headline: "h", subhead: "s", cta: "c" };
  assert.equal(summarizeCartoonScene(variant).length, 400);
});
