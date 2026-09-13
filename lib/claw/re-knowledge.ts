// Local retrieve for services/aion-brain/knowledge/reverse-engineering/
// Markdown on disk is the source of truth. A compact catalog keeps Claw
// useful if the standalone image omitted the files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const RE_KNOWLEDGE_NOTES = [
  "playbook",
  "ghidra",
  "radare2",
  "rizin",
  "cutter",
  "ida-pro",
  "binary-ninja",
  "x64dbg",
  "dnspy",
  "imhex",
  "angr",
  "capstone",
  "keystone",
  "unicorn"
] as const;

export type ReKnowledgeId = (typeof RE_KNOWLEDGE_NOTES)[number];

const EMBEDDED: Record<ReKnowledgeId, string> = {
  playbook: "Static triage: hash → file/strings → optional YARA/CAPA → bounded r2 → Ghidra headless only if installed → escalate IDA/BN. Never run samples on the Next.js host.",
  ghidra: "NSA Ghidra (Apache 2.0, github.com/NationalSecurityAgency/ghidra). Free decompiler + headless. Not vendored here. Recommend after r2 when the operator has a workstation.",
  radare2: "r2 / rada.re CLI. Default Claw execution path (re_radare2): aaa; iI; iE; ii; iz. Reject !shell and writes. E2B install is best-effort.",
  rizin: "rizin / rz-bin fork of r2. Same static jobs. Fallback binary when radare2 is missing in E2B.",
  cutter: "Qt GUI for Rizin. Human interactive graphs only — Claw does not launch Cutter.",
  "ida-pro": "Paid Hex-Rays IDA Pro. Knowledge only. Never claim we embed or license it. Human escalation for Hex-Rays decompiler.",
  "binary-ninja": "Paid Vector 35 Binary Ninja (BNIL/HLIL). Knowledge only. Never claim we embed it.",
  x64dbg: "Free Windows user-mode debugger. Dynamic debug only on an isolated human VM — not E2B Linux detonation.",
  dnspy: "Free .NET decompiler (dnSpy/dnSpyEx). Use when file/strings show CLR / mscoree.",
  imhex: "Free pattern hex editor for unknown formats and firmware blobs. GUI is human-side.",
  angr: "Python symbolic execution / CFG. Heavy optional pip. Not default. auto_load_libs=False.",
  capstone: "Disassembly engine used by r2/angr/Ghidra loaders. Not a full SRE suite.",
  keystone: "Assembler engine (Capstone sister). Knowledge + tiny lab examples only — no exploit/license patches.",
  unicorn: "QEMU-based CPU emulator engine. Bounded snippet emulation in a lab; not host malware detonation."
};

function candidateDirs(): string[] {
  const cwd = process.cwd();
  return [
    resolve(cwd, "services/aion-brain/knowledge/reverse-engineering"),
    resolve(cwd, "knowledge/reverse-engineering"),
    resolve(cwd, "../knowledge/reverse-engineering"),
    resolve(import.meta.dirname ?? cwd, "../../services/aion-brain/knowledge/reverse-engineering")
  ];
}

export function reKnowledgeDir(): string | null {
  for (const dir of candidateDirs()) {
    if (existsSync(join(dir, "playbook.md")) && existsSync(join(dir, "ghidra.md"))) return dir;
  }
  return null;
}

export function listReKnowledgeFiles(): string[] {
  const dir = reKnowledgeDir();
  if (!dir) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
}

export function readReKnowledgeNote(id: string): { id: string; path: string | null; body: string; source: "disk" | "embedded" } {
  const slug = String(id || "").trim().toLowerCase().replace(/\.md$/, "");
  const known = RE_KNOWLEDGE_NOTES.find((n) => n === slug);
  const dir = reKnowledgeDir();
  if (dir && known) {
    const path = join(dir, `${known}.md`);
    if (existsSync(path)) {
      return { id: known, path, body: readFileSync(path, "utf8"), source: "disk" };
    }
  }
  if (known) return { id: known, path: null, body: EMBEDDED[known], source: "embedded" };
  return { id: slug || "unknown", path: null, body: "", source: "embedded" };
}

export function retrieveReKnowledge(query = "", limit = 6): Array<{ id: string; score: number; preview: string; source: "disk" | "embedded" }> {
  const q = String(query || "").toLowerCase().trim();
  const tokens = q ? q.split(/[^a-z0-9_+.-]+/).filter((t) => t.length > 1) : [];
  const hits = RE_KNOWLEDGE_NOTES.map((id) => {
    const note = readReKnowledgeNote(id);
    const hay = `${id} ${note.body}`.toLowerCase();
    let score = q ? 0 : id === "playbook" ? 3 : 1;
    for (const token of tokens) {
      if (id.includes(token)) score += 5;
      if (hay.includes(token)) score += 2;
    }
    return {
      id,
      score,
      preview: note.body.replace(/\s+/g, " ").trim().slice(0, 700),
      source: note.source
    };
  });
  return hits.filter((h) => !q || h.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(14, limit)));
}

export function reKnowledgeStatus() {
  const dir = reKnowledgeDir();
  const files = listReKnowledgeFiles();
  return {
    knowledge: true as const,
    corpusDir: dir,
    diskFiles: files,
    notes: RE_KNOWLEDGE_NOTES.slice(),
    playbook: Boolean(dir && existsSync(join(dir, "playbook.md")))
  };
}
