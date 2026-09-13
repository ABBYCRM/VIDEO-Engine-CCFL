# Ghidra (NSA) — GDY module 12

**What.** Open-source SRE workbench (Apache 2.0) from the U.S. NSA.
Upstream: https://github.com/NationalSecurityAgency/ghidra — releases,
not a git submodule in VIDEO-Engine. Java 21+ GUI plus
`support/analyzeHeadless`.

**When to use.** Full decompiler (P-Code → C-like), multi-arch loaders
(PE/ELF/Mach-O/firmware), version tracking, Ghidra Scripts (Java/Python
via Jython/PyGhidra), collaborative projects. After `re_triage` /
`re_radare2` when the operator needs a project, cross-refs, and
decompilation a bounded r2 script cannot give.

**Strengths.** Free; excellent decompiler for many ISAs; programmable;
headless batch import; graph + data-type manager; no per-seat license.

**Limits.** Heavy JVM; slow first analysis; not installed in default E2B
or this Next.js image. We **do not** vendor the multi-GB tree. Headless
is optional and environment-dependent. GUI is a human workstation tool.

**Free/paid.** Free (open source). Training/support is third-party.

**Typical workflow.**
- GUI: File → New Project → Import → Auto Analysis → Listing + Decompile.
- Headless (human / lab image):
  `analyzeHeadless /tmp/ghidra_proj P -import sample.bin -processor x86:LE:64:default -analysisTimeoutPerFile 300`
- Scripts live under `Ghidra/Features/*/ghidra_scripts`.

**How Claw should recommend.** Never claim Ghidra is embedded. If the
operator already has a Ghidra install, give the headless import sketch
and the GitHub release URL. Otherwise: `re_triage` → `re_radare2` →
`re_catalog` query `ghidra`, then escalate. `gdy_search q=ghidra`.
