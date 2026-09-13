# IDA Pro — GDY module 12 (paid, knowledge only)

**What.** Hex-Rays IDA Pro: commercial disassembler/debugger with the
Hex-Rays decompiler add-on. Windows/Linux/macOS. **Not embedded, not
licensed, not vendored** in VIDEO-Engine or E2B.

**When to use.** Human escalation: complex obfuscation, kernel/driver,
firmware with FLIRT/Lumia signatures, team IDB sharing, Hex-Rays
pseudocode the operator already pays for.

**Strengths.** Best-in-class decompiler (with Hex-Rays); huge processor
coverage; IDC/IDAPython; Type libraries; debugger integrations.

**Limits.** Expensive seats + decompiler SKUs. IDA Free is a limited
non-commercial viewer — still not shipped here. License servers and
`.idb`/`.i64` are workstation artifacts.

**Free/paid.** Paid (IDA Free exists with restrictions). Claw must
never claim we run IDA or bypass a license.

**Typical workflow (human).** Open binary → auto-analysis → Functions
window → F5 decompile → rename / set types → produce notes. Headless
batch via IDAPython is a licensed-lab concern, not a Claw tool.

**How Claw should recommend.** After static triage, say: “Escalate to a
human IDA Pro workstation if you need Hex-Rays.” Point at GDY catalog
facts (`re_catalog` / `gdy_search q=IDA Pro`). Do not invent plugin
lists as if they are installed here.
