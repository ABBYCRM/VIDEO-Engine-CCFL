// Reverse-engineering triage for Claw.
// Samples execute only in E2B. This process never maps or runs the bytes
// except to copy a size-capped buffer into the sandbox.

import { readFileSync } from "node:fs";
import { validateSteelUrl } from "@/lib/steel-url";
import { e2bCommand, e2bOut, isE2bConfigured, missing } from "@/lib/claw/connectors";
import { isGdyConfigured, gdyCategories, gdySearch } from "@/lib/claw/gdy";
import { getFile } from "@/lib/claw/store";
import { retrieveReKnowledge, reKnowledgeStatus } from "@/lib/claw/re-knowledge";

export const DEFAULT_R2_SCRIPT = "aaa; iI; iE; ii; iz";
export const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
export const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const SAMPLE_PATH = "/tmp/ve-re-sample.bin";

const BLOCKED_R2 = /(?:[!`$|<>]|wtf!?|\bood\b|\bdc\b|\bds\b|\bdso\b|\bwow\b|(?:^|[;\s])w[0-9a-z]?|(?:^|[;\s])wa\b|(?:^|[;\s])wx\b|python|\bchmod\b|\brm\s|\bcurl\b|\bwget\b|\bnc\b|\bbash\b|\bdbg\.|\/exec|\beval\b|\bpopen\b)/i;

const ALLOWED_R2 = /^(?:a{1,4}=?|aan|i[IEizSMH]?|izz?|il|ir|ie|aflj?|afi|pdfj?|pdj?|pd\s+\d+|pxj?|px\s+\d+|s\s+\S+|\/[a-z]?\s+\S+|e\s+scr\.color=0|e\s+asm\.bits=(?:16|32|64)|e\s+bin\.relocs\.apply=true|\?v?)$/i;

export function sanitizeRadare2Script(raw: unknown): { ok: true; script: string } | { ok: false; error: string; code: string } {
  const script = String(raw ?? "").trim() || DEFAULT_R2_SCRIPT;
  if (script.length > 240) return { ok: false, error: "r2 script must be ≤240 characters", code: "BAD_ARGS" };
  if (BLOCKED_R2.test(script)) {
    return { ok: false, error: "Rejected destructive or shell-escaping r2 command. Allowed: analysis/info/strings/disasm (aaa, iI, iE, ii, iz, pd, px).", code: "REJECTED_CMD" };
  }
  const parts = script.split(";").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, error: "r2 script is empty", code: "BAD_ARGS" };
  for (const part of parts) {
    if (!ALLOWED_R2.test(part)) {
      return { ok: false, error: `Rejected r2 command: ${part}. Use aaa; iI; iE; ii; iz (or pd/px/s/afl).`, code: "REJECTED_CMD" };
    }
  }
  return { ok: true, script: parts.join("; ") };
}

function clip(text: string, max = 5_000): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…[truncated]`, truncated: true };
}

function decodeSnippet(input: { hex?: string; base64?: string }): { ok: true; bytes: Buffer } | { ok: false; error: string; code: string } {
  const hex = String(input.hex || "").replace(/\s+/g, "");
  const b64 = String(input.base64 || "").replace(/\s+/g, "");
  if (hex) {
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2) return { ok: false, error: "hex must be even-length [0-9a-f]", code: "BAD_ARGS" };
    const bytes = Buffer.from(hex, "hex");
    if (!bytes.length || bytes.length > MAX_SAMPLE_BYTES) return { ok: false, error: `hex payload must be 1–${MAX_SAMPLE_BYTES} bytes`, code: "BAD_ARGS" };
    return { ok: true, bytes };
  }
  if (b64) {
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.length || bytes.length > MAX_SAMPLE_BYTES) return { ok: false, error: `base64 payload must decode to 1–${MAX_SAMPLE_BYTES} bytes`, code: "BAD_ARGS" };
    return { ok: true, bytes };
  }
  return { ok: false, error: "Provide url, fileId, hex, or base64", code: "BAD_ARGS" };
}

function clawFileBytes(fileId: string): { ok: true; bytes: Buffer; name: string } | { ok: false; error: string; code: string } {
  const file = getFile(fileId);
  if (!file) return { ok: false, error: "Claw file not found", code: "BAD_ARGS" };
  if (file.size > MAX_SAMPLE_BYTES) return { ok: false, error: `file exceeds ${MAX_SAMPLE_BYTES} byte cap`, code: "BAD_ARGS" };
  try {
    const bytes = readFileSync(file.path);
    if (!bytes.length) return { ok: false, error: "file is empty", code: "BAD_ARGS" };
    return { ok: true, bytes, name: file.name };
  } catch {
    return { ok: false, error: "could not read Claw file", code: "BAD_ARGS" };
  }
}

type SampleSource =
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; bytes: Buffer }
  | { kind: "snippet"; bytes: Buffer };

function resolveSample(input: { url?: string; fileId?: string; id?: string; hex?: string; base64?: string }):
  { ok: true; source: SampleSource } | { ok: false; error: string; code: string } {
  const urlRaw = String(input.url || "").trim();
  const fileId = String(input.fileId || input.id || "").trim();
  if (urlRaw) {
    try { return { ok: true, source: { kind: "url", url: validateSteelUrl(urlRaw) } }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error), code: "BAD_ARGS" }; }
  }
  if (fileId) {
    const file = clawFileBytes(fileId);
    if (!file.ok) return file;
    return { ok: true, source: { kind: "file", name: file.name, bytes: file.bytes } };
  }
  const snippet = decodeSnippet(input);
  if (!snippet.ok) return snippet;
  return { ok: true, source: { kind: "snippet", bytes: snippet.bytes } };
}

function stageSampleCmd(source: SampleSource): string {
  if (source.kind === "url") {
    return `python3 - <<'PY'
import urllib.request, sys
url = ${JSON.stringify(source.url)}
req = urllib.request.Request(url, headers={"User-Agent":"video-engine-claw-re/1.0"})
with urllib.request.urlopen(req, timeout=15) as res:
    data = res.read(${MAX_DOWNLOAD_BYTES + 1})
if len(data) > ${MAX_DOWNLOAD_BYTES}:
    sys.stderr.write("download exceeds cap\\n"); sys.exit(2)
open(${JSON.stringify(SAMPLE_PATH)}, "wb").write(data)
print(len(data))
PY`;
  }
  return `python3 -c ${JSON.stringify(`open(${JSON.stringify(SAMPLE_PATH)},"wb").write(__import__("base64").b64decode(${JSON.stringify(source.bytes.toString("base64"))}))`)}`;
}

const TRIAGE_PY = `
import hashlib, json, math, collections, os, shutil, subprocess, sys
path = sys.argv[1]
data = open(path, "rb").read()
n = len(data)
counts = collections.Counter(data)
ent = 0.0
if n:
    for c in counts.values():
        p = c / n
        ent -= p * math.log2(p)
ascii_s = []
cur = []
for b in data:
    if 32 <= b < 127:
        cur.append(chr(b))
    else:
        if len(cur) >= 6:
            ascii_s.append("".join(cur)[:160])
        cur = []
    if len(ascii_s) >= 40:
        break
if len(cur) >= 6 and len(ascii_s) < 40:
    ascii_s.append("".join(cur)[:160])
file_out = ""
if shutil.which("file"):
    try:
        file_out = subprocess.check_output(["file", "-b", path], text=True, timeout=8).strip()
    except Exception as e:
        file_out = str(e)
print(json.dumps({
    "sha256": hashlib.sha256(data).hexdigest(),
    "md5": hashlib.md5(data).hexdigest(),
    "size": n,
    "entropy": round(ent, 4),
    "magic_hex": data[:16].hex(),
    "file": file_out or None,
    "strings": ascii_s,
    "notes": [
        "high entropy / maybe packed" if ent >= 7.2 else "entropy typical of uncompressed code or text",
        "PE" if data[:2] == b"MZ" else "ELF" if data[:4] == b"\\x7fELF" else "Mach-O" if data[:4] in (b"\\xcf\\xfa\\xed\\xfe", b"\\xfe\\xed\\xfa\\xce", b"\\xca\\xfe\\xba\\xbe") else "unknown-or-other"
    ]
}))
`.trim();

function e2bMissing() {
  return missing("E2B", "E2B_API_KEY", "static RE triage of untrusted samples in a hosted sandbox — never on this host");
}

export async function reTriage(input: { url?: string; fileId?: string; id?: string; hex?: string; base64?: string; timeoutMs?: number }) {
  if (!isE2bConfigured()) return e2bMissing();
  const resolved = resolveSample(input);
  if (!resolved.ok) return resolved;
  const cmd = `${stageSampleCmd(resolved.source)} && python3 -c ${JSON.stringify(TRIAGE_PY)} ${JSON.stringify(SAMPLE_PATH)}`;
  const ran = e2bOut(await e2bCommand({ cmd, timeoutMs: Math.min(45_000, Number(input.timeoutMs) || 25_000) }));
  if (!ran.ok) {
    return { ...ran, ok: false as const, tool: "re_triage", note: "Static triage only. Sample stays in E2B — never on this host." };
  }
  let analysis: unknown = ran.stdout;
  try { analysis = JSON.parse(String(ran.stdout || "").trim()); } catch { /* keep text */ }
  const source = resolved.source;
  return {
    ok: true as const,
    via: "e2b",
    tool: "re_triage",
    source: source.kind === "url" ? { url: source.url } : source.kind === "file" ? { file: source.name, bytes: source.bytes.length } : { snippetBytes: source.bytes.length },
    analysis,
    stderr: ran.stderr,
    exitCode: ran.exitCode,
    note: "Static only. Next: re_radare2 for imports/exports, re_knowledge for tool notes, re_catalog for live GDY module-12 facts. Do not detonate on this host."
  };
}

export async function reRadare2(input: { url?: string; fileId?: string; id?: string; hex?: string; base64?: string; commands?: string; timeoutMs?: number }) {
  const allowed = sanitizeRadare2Script(input.commands);
  if (!allowed.ok) return allowed;
  if (!isE2bConfigured()) return e2bMissing();
  const resolved = resolveSample(input);
  if (!resolved.ok) return resolved;

  const installer = `
set -e
BIN=""
if command -v r2 >/dev/null 2>&1; then BIN=r2
elif command -v radare2 >/dev/null 2>&1; then BIN=radare2
elif command -v rizin >/dev/null 2>&1; then BIN=rizin
else
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >/tmp/r2-apt.log 2>&1 || true
    apt-get install -y -qq radare2 rizin >/tmp/r2-apt.log 2>&1 || apt-get install -y -qq radare2 >/tmp/r2-apt.log 2>&1 || true
  fi
  if command -v r2 >/dev/null 2>&1; then BIN=r2
  elif command -v radare2 >/dev/null 2>&1; then BIN=radare2
  elif command -v rizin >/dev/null 2>&1; then BIN=rizin
  fi
fi
if [ -z "$BIN" ]; then
  echo '{"ok":false,"error":"radare2_unavailable","hint":"E2B image could not install r2/rizin. Use re_triage Python notes and the knowledge pack."}'
  exit 0
fi
echo "ENGINE=$BIN"
"$BIN" -e scr.color=0 -e bin.relocs.apply=true -c ${JSON.stringify(allowed.script)} -q ${JSON.stringify(SAMPLE_PATH)} || true
`.trim();

  const ran = e2bOut(await e2bCommand({
    cmd: `${stageSampleCmd(resolved.source)} && bash -lc ${JSON.stringify(installer)}`,
    timeoutMs: Math.min(55_000, Number(input.timeoutMs) || 40_000)
  }));
  const out = clip(ran.stdout);
  const unavailable = /radare2_unavailable/.test(out.text);
  return {
    ok: !unavailable && ran.ok,
    via: "e2b",
    tool: "re_radare2",
    engine: unavailable ? "none" : "radare2-or-rizin",
    script: allowed.script,
    stdout: out.text,
    truncated: out.truncated,
    stderr: ran.stderr.slice(0, 1500),
    exitCode: ran.exitCode,
    note: unavailable
      ? "radare2/rizin best-effort install failed. Knowledge pack still applies; re_triage remains the static path."
      : "Bounded static r2/rizin only. Escalate packed/obfuscated samples to a human Ghidra/IDA/BN workstation."
  };
}

export async function reCatalog(query?: string) {
  const q = String(query || "reverse engineering binary analysis").trim() || "reverse engineering binary analysis";
  const [search, categories] = await Promise.all([
    gdySearch(q),
    gdyCategories()
  ]);
  return {
    ok: Boolean((search as { ok?: boolean }).ok || (categories as { ok?: boolean }).ok),
    via: "gdy",
    tool: "re_catalog",
    query: q,
    focus: "Reverse Engineering / Binary Analysis (GDY module 12)",
    search,
    categories,
    knowledge: retrieveReKnowledge(q, 4),
    note: "Live GDY catalog facts plus local RE notes. IDA Pro and Binary Ninja are knowledge-only — not installed here."
  };
}

export function reKnowledge(query?: string, limit?: number) {
  return {
    ok: true as const,
    via: "re-knowledge",
    tool: "re_knowledge",
    ...reKnowledgeStatus(),
    hits: retrieveReKnowledge(query, limit ?? 6),
    note: "Local operator notes. Paid IDA/BN are not embedded. Practical analysis: re_triage / re_radare2 in E2B."
  };
}

export function reverseEngineeringStatus() {
  return {
    knowledge: true as const,
    e2b: { configured: isE2bConfigured() },
    gdy: { configured: isGdyConfigured() }
  };
}
