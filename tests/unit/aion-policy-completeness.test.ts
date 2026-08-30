// tests/unit/aion-policy-completeness.test.ts
//
// Fails the moment lib/claw/tools.ts and lib/aion/policy.ts drift. The
// previous draft of this file imported the real CLAW_TOOLS array, but
// lib/claw/tools.ts uses @/lib path aliases that only Next.js resolves
// — raw `node --test` can't follow them. We work around that by
// parsing the names out of tools.ts with a regex, which is the
// authoritative source for "what tool names exist in the registry" for
// the purpose of this completeness check.
//
// This is the test that should have caught the original 9-tool gap
// before it shipped. It will now catch it on every CI run.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { CLASSIFIED_TOOL_NAMES } from "../../lib/aion/policy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const toolsFile = resolve(here, "../../lib/claw/tools.ts");

function readRegisteredToolNames(): string[] {
  const text = readFileSync(toolsFile, "utf8");
  // Each top-level entry in CLAW_TOOLS has `    name: "<tool-name>"`
  // (exactly 4 spaces of indentation). Nested provider attempt arrays
  // (e.g. inside steel_scrape's fallback chain) use more indentation, so
  // anchoring on 4 spaces keeps us reading only the registry.
  const re = /^ {4}name:\s*"([a-z][a-z0-9_]*)"/gm;
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    out.add(m[1]);
  }
  return [...out];
}

test("every registered Claw tool has an AION policy classification", () => {
  const registered = readRegisteredToolNames();
  const unclassified = registered.filter(
    (name) => !CLASSIFIED_TOOL_NAMES.has(name)
  );
  assert.deepEqual(
    unclassified,
    [],
    `Unclassified tools would silently REJECT in production: ${unclassified.join(", ")}`
  );
});

test("no classified name references a tool that no longer exists in tools.ts", () => {
  const registered = new Set(readRegisteredToolNames());
  const stale = [...CLASSIFIED_TOOL_NAMES].filter(
    (name) => !registered.has(name)
  );
  assert.deepEqual(
    stale,
    [],
    `Policy references removed tools: ${stale.join(", ")}`
  );
});
