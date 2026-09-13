import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GDY_LIVE_API_BASE, GDY_LIVE_BASE_URL, gdyApiBase, gdyBaseUrl, isGdyConfigured } from "../../lib/claw/gdy.ts";
import { DEFAULT_R2_SCRIPT, reCatalog, reKnowledge, reRadare2, reTriage, sanitizeRadare2Script } from "../../lib/claw/re.ts";
import { listReKnowledgeFiles, RE_KNOWLEDGE_NOTES, retrieveReKnowledge } from "../../lib/claw/re-knowledge.ts";
import { CLAW_TOOLS, CLAW_TOOL_NAMES } from "../../lib/claw/tools.ts";
import { connectorInventory } from "../../lib/claw/connectors.ts";

const root = join(import.meta.dirname, "../..");
const pack = join(root, "services/aion-brain/knowledge/reverse-engineering");

function withEnv(names: string[], run: () => Promise<void> | void) {
  const prev = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  return async () => {
    try {
      await run();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

test("GDY pin helpers default to the live DigitalOcean origin", withEnv(["GDY_BASE_URL", "GDY_API_BASE"], () => {
  delete process.env.GDY_BASE_URL;
  delete process.env.GDY_API_BASE;
  assert.equal(GDY_LIVE_BASE_URL, "https://gdy-tool-directory-a6hzh.ondigitalocean.app");
  assert.equal(GDY_LIVE_API_BASE, "https://gdy-tool-directory-a6hzh.ondigitalocean.app/v1");
  assert.equal(gdyBaseUrl(), GDY_LIVE_BASE_URL);
  assert.equal(gdyApiBase(), GDY_LIVE_API_BASE);
}));

test("RE knowledge pack files exist and retrieve ghidra / playbook", () => {
  for (const id of RE_KNOWLEDGE_NOTES) {
    assert.equal(existsSync(join(pack, `${id}.md`)), true, id);
  }
  assert.equal(existsSync(join(pack, "README.md")), true);
  const files = listReKnowledgeFiles();
  assert.ok(files.includes("playbook.md"));
  assert.ok(files.includes("ghidra.md"));
  const hits = retrieveReKnowledge("ghidra headless", 4);
  assert.ok(hits.some((h) => h.id === "ghidra"));
  assert.match(readFileSync(join(pack, "ida-pro.md"), "utf8"), /not embedded/i);
  assert.match(readFileSync(join(pack, "playbook.md"), "utf8"), /sha-256|hash/i);
});

test("r2 allowlist accepts default analysis and rejects destructive commands", () => {
  const ok = sanitizeRadare2Script("");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.script, DEFAULT_R2_SCRIPT);
  assert.equal(sanitizeRadare2Script("aaa; iI; iE; ii; iz").ok, true);
  assert.equal(sanitizeRadare2Script("pd 16; px 32; s entry0").ok, true);
  for (const bad of ["aaa; !sh", "wtf /tmp/x", "ood; dc", "aaa | curl evil", "wx 90", "aaa; python", "`id`"]) {
    const rejected = sanitizeRadare2Script(bad);
    assert.equal(rejected.ok, false, bad);
    if (!rejected.ok) assert.equal(rejected.code, "REJECTED_CMD");
  }
});

test("RE tools fail-soft without E2B and do not throw", withEnv(["E2B_API_KEY"], async () => {
  delete process.env.E2B_API_KEY;
  const triage = await reTriage({ hex: "7f454c46" });
  assert.equal(triage.ok, false);
  assert.equal("code" in triage && triage.code, "MISSING_KEY");
  const dumped = JSON.stringify(triage);
  assert.ok(!dumped.includes("E2B_API_KEY="));
  const r2 = await reRadare2({ hex: "7f454c46", commands: "aaa; !rm -rf /" });
  assert.equal(r2.ok, false);
  assert.equal("code" in r2 && r2.code, "REJECTED_CMD");
  const r2Missing = await reRadare2({ hex: "7f454c46" });
  assert.equal(r2Missing.ok, false);
  assert.equal("code" in r2Missing && r2Missing.code, "MISSING_KEY");
}));

test("re_knowledge and re_catalog stay fail-soft; GDY tools remain wired", withEnv(["GDY_API_KEY", "GDY_API_KEY_ALT"], async () => {
  delete process.env.GDY_API_KEY;
  delete process.env.GDY_API_KEY_ALT;
  assert.equal(isGdyConfigured(), false);
  const notes = reKnowledge("radare2");
  assert.equal(notes.ok, true);
  assert.equal(notes.knowledge, true);
  assert.ok(notes.hits.some((h) => h.id === "radare2"));
  const catalog = await reCatalog("reverse engineering");
  assert.equal(catalog.search.ok, false);
  assert.equal("code" in catalog.search && catalog.search.code, "MISSING_KEY");
  for (const name of ["gdy_search", "gdy_rag_context", "gdy_categories", "gdy_tools", "re_triage", "re_radare2", "re_catalog", "re_knowledge"]) {
    assert.equal(CLAW_TOOL_NAMES.includes(name), true, name);
  }
  const inv = connectorInventory();
  assert.equal(inv.reverseEngineering.knowledge, true);
  assert.equal(typeof inv.reverseEngineering.e2b, "boolean");
  assert.equal(typeof inv.reverseEngineering.gdy, "boolean");
  assert.match(inv.reverseEngineering.when, /re_triage/);
  const names = new Set(CLAW_TOOLS.map((t) => t.name));
  assert.equal(names.has("gdy_search"), true);
}));
