# Reverse Engineering / Binary Analysis corpus

Tracked operator notes for Claw and Aion-Brain. This pack teaches **what the
tools are and how to triage** — it does **not** vendor Ghidra, IDA Pro,
Binary Ninja, radare2, or any other RE suite into the git tree.

These files are the source of truth that the runtime ingests into:

1. **Claw `re_knowledge`** (`lib/claw/re-knowledge.ts`) — keyword retrieve of this directory (and a compact embedded catalog if the files are not on the standalone image).
2. **Aion-Brain `re_knowledge`** (`lib/re_knowledge.js`) — same markdown, local retrieve (no paid API).
3. **Live catalog facts** — `re_catalog` / `gdy_search` against GDY module 12 (Reverse Engineering / Binary Analysis). Do not invent tool URLs when GDY is configured.

## Authority

`Playbook > Tool notes > GDY live catalog > Conversation > Inference`

| File | Authority | Contents |
|------|-----------|----------|
| `playbook.md` | Playbook | Hash → file/strings → optional YARA/CAPA → r2 static → Ghidra headless if present → escalate to human IDA/BN |
| `ghidra.md` | Tool note | NSA Ghidra + github.com/NationalSecurityAgency/ghidra |
| `radare2.md` | Tool note | radare2 / rada.re |
| `rizin.md` | Tool note | Rizin |
| `cutter.md` | Tool note | Cutter (Rizin GUI) |
| `ida-pro.md` | Tool note | IDA Pro — paid, knowledge only |
| `binary-ninja.md` | Tool note | Binary Ninja — paid, knowledge only |
| `x64dbg.md` | Tool note | x64dbg |
| `dnspy.md` | Tool note | dnSpy |
| `imhex.md` | Tool note | ImHex |
| `angr.md` | Tool note | angr |
| `capstone.md` | Tool note | Capstone engine |
| `keystone.md` | Tool note | Keystone engine |
| `unicorn.md` | Tool note | Unicorn engine |

## Hard limits

- Never clone or commit Ghidra / IDA / Binary Ninja / r2 trees here.
- Never claim Claw embeds IDA Pro or Binary Ninja.
- Untrusted samples run only in E2B (`re_triage`, `re_radare2`) — never in the Next.js process.
- Do not detonate malware on the production host. Dynamic debug is a human escalation.
- Paid tools are **knowledge + recommend-to-human** only.

## Claw tools

| Tool | Does |
|------|------|
| `re_knowledge` | Retrieve these notes |
| `re_catalog` | Live GDY Reverse Engineering / Binary Analysis facts |
| `re_triage` | E2B sha256 / file / strings / entropy |
| `re_radare2` | Bounded r2/rizin in E2B (best-effort install) |

Operator prompt: *“Triage this sample: \<public URL or claw file id\>. Static only.”*
