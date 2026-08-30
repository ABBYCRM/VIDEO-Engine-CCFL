import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// lib/claw/runtime.ts pulls in @/lib/db (and everything downstream of it),
// which `node --test` cannot resolve via the `@/` alias — same constraint
// documented in tests/unit/aion-policy-completeness.test.ts. Extract the
// TOOL_RE literal straight from the source file's text instead of importing
// the module, so this test can't silently drift from what runtime.ts
// actually uses.
function extractToolRe(): RegExp {
  const src = fs.readFileSync(path.join(__dirname, "../../lib/claw/runtime.ts"), "utf8");
  const m = /const TOOL_RE = (\/.*\/[a-z]*);/.exec(src);
  if (!m) throw new Error("Could not find TOOL_RE literal in lib/claw/runtime.ts");
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

test("TOOL_RE parses a well-formed tool_call with the correct closing tag", () => {
  const re = new RegExp(extractToolRe().source, "gi");
  const text = `<tool_call name="app_status">{}</tool_call>`;
  const m = re.exec(text);
  assert.ok(m, "expected a match");
  assert.equal(m![1], "app_status");
  assert.equal(m![2], "{}");
});

test("TOOL_RE tolerates a missing slash on the closing tag (the real-world model mistake)", () => {
  const re = new RegExp(extractToolRe().source, "gi");
  const text = `<tool_call name="ig_list_media">{"limit":12}<tool_call>`;
  const m = re.exec(text);
  assert.ok(m, "expected a match even with the missing-slash closer");
  assert.equal(m![1], "ig_list_media");
  assert.equal(m![2], `{"limit":12}`);
});

test("TOOL_RE refuses a name attribute containing pasted example arg-shape text", () => {
  const re = new RegExp(extractToolRe().source, "gi");
  // The exact malformed shape observed in practice: the model pastes the
  // tool catalog's own "name {args-shape}" documentation line into the name
  // attribute instead of a bare tool name.
  const text = `<tool_call name="app_status {}">{}<tool_call>`;
  const m = re.exec(text);
  assert.equal(m, null, "a name containing spaces/braces must not be treated as a real tool invocation");
});

test("a fully garbled multi-call response (the real screenshot case) parses to zero valid calls, not a false success", () => {
  const re = new RegExp(extractToolRe().source, "gi");
  const text = [
    `<tool_call name="app_status {}">{}<tool_call>`,
    `<tool_call name="ig_analyze_media {"mediaId":"media_id_from_ig_list_media","question":"optional"}">{"via":"composio"}<tool_call>`
  ].join("\n");
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.push(m[1]);
  assert.deepEqual(found, [], "garbled name attributes must not be picked up as callable tool names");
  // This is exactly the case runtime.ts's `text.toLowerCase().includes(marker)`
  // guard exists for: zero valid calls, but the literal marker is still
  // present, so the response must be treated as a malformed attempt (and
  // retried or rejected) rather than a legitimate final answer.
  assert.ok(text.toLowerCase().includes("<tool_call"));
});
