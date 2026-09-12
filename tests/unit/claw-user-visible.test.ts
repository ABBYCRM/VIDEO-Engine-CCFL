import test from "node:test";
import assert from "node:assert/strict";
import {
  filterAionSseDelta,
  humanToolProgress,
  isInternalAionSseType,
  isTranscriptAssistantContent,
  looksLikeInternalState,
  preferAionExecute,
  routeAionMode,
  sanitizeUserVisibleMessage,
  toUserVisibleAssistant
} from "../../lib/claw/user-visible.ts";

test("user-visible sanitizer strips control-loop state dumps", () => {
  const dumped = [
    "SELF_OBSERVATION phase",
    "SELF_STATE: {\"health\":\"HEALTHY\",\"free_energy\":0.2}",
    "free_energy: 0.41",
    "INTROSPECTION / METACOGNITION / METACONTROL",
    "execution_plan {\"goal\":\"x\",\"steps\":[\"a\"]}",
    "{\"instruction\":\"compare\",\"execution\":{\"goal\":\"x\"},\"self_state\":{\"health\":\"HEALTHY\"}}",
    "{\"trinity\":\"GO\",\"reasons\":[\"need evidence\"],\"cycles\":[]}",
    "Status: verified checks. Acceptance checks passed against recorded tool evidence.",
    "- PASS: Report saved (e1)",
    "- NOT VERIFIED: Production build",
    "COMMIT",
    "DEFER",
    "Trinity: HOLD",
    "<tool_call name=\"web_search\">{\"query\":\"x\"}</tool_call>",
    "previous_tool_results: [{\"name\":\"web_search\"}]",
    "LOOP_DETECTED: retry forbidden",
    "```json\n{\"self_state\":{\"phase\":\"ACTION\"},\"free_energy\":1}\n```"
  ].join("\n");

  const cleaned = sanitizeUserVisibleMessage(dumped);
  assert.equal(cleaned, "");
  assert.equal(isTranscriptAssistantContent(dumped), false);
  assert.equal(looksLikeInternalState(dumped), true);
});

test("user-visible sanitizer keeps a normal chat answer and drops only the guts", () => {
  const mixed = [
    "SELF_OBSERVATION",
    "I scraped the page and the title is Example Domain.",
    "{\"self_state\":{\"health\":\"HEALTHY\"},\"cycles\":[]}",
    "Ask if you want me to keep going."
  ].join("\n");
  const cleaned = sanitizeUserVisibleMessage(mixed);
  assert.match(cleaned, /Example Domain/);
  assert.match(cleaned, /keep going/);
  assert.doesNotMatch(cleaned, /SELF_OBSERVATION|self_state|cycles/);
  assert.equal(toUserVisibleAssistant(mixed), cleaned);
});

test("actionable prompts route to execute, advice stays consult", () => {
  assert.equal(routeAionMode("Search the docket for hearings"), "execute");
  assert.equal(routeAionMode("Scrape https://example.com and summarize it"), "execute");
  assert.equal(routeAionMode("Launch a Cursor agent to fix the login"), "execute");
  assert.equal(routeAionMode("Email the client the hearing dates"), "execute");
  assert.equal(preferAionExecute("research the competitor site"), true);
  assert.equal(routeAionMode("What do you think about Trinity?"), "consult");
  assert.equal(routeAionMode("Explain the lattice in plain English"), "consult");
  assert.equal(preferAionExecute("What do you think about Trinity?"), false);
});

test("Brain SSE control events are not assistant content", () => {
  assert.equal(isInternalAionSseType("self_state"), true);
  assert.equal(isInternalAionSseType("trinity"), true);
  assert.equal(isInternalAionSseType("phase"), true);
  assert.equal(isInternalAionSseType("tool_start"), true);
  assert.equal(isInternalAionSseType("tool_end"), true);
  assert.equal(isInternalAionSseType("delta"), false);
  assert.equal(filterAionSseDelta("SELF_STATE health=HEALTHY free_energy=0.2"), "");
  assert.equal(filterAionSseDelta("The docket lists two hearings."), "The docket lists two hearings.");
});

test("tool progress chips stay human", () => {
  assert.equal(humanToolProgress("web_search"), "Searching…");
  assert.equal(humanToolProgress("steel_scrape"), "Reading the page…");
  assert.equal(humanToolProgress("cursor_launch"), "Spawned Cursor agent…");
  assert.doesNotMatch(humanToolProgress("aion_execute"), /self_state|JSON|FREE_ENERGY/i);
});
