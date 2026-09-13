# Cutter — GDY module 12

**What.** Qt GUI for Rizin (formerly a radare2 GUI). Disassembly,
graph, hexdump, decompiler plugins (rz-ghidra when the operator
installed them). https://cutter.re — GUI only; not a Claw runtime.

**When to use.** Human interactive analysis after Claw static triage.
Tell the operator to open the same sample in Cutter on their
workstation — Claw will not start a Qt display in E2B.

**Strengths.** Approachable graphs; Rizin power underneath; free;
optional Ghidra decompiler plugin.

**Limits.** Needs a desktop. Headless CI should use `rizin`/`rz-bin`,
not Cutter. Plugin decompilers are extra installs.

**Free/paid.** Free (GPL / LGPL components).

**Typical workflow.** File → Open → auto-analysis → Imports / Strings /
Graph. Export notes; do not expect Claw to drive the GUI.

**How Claw should recommend.** After `re_triage` / `re_radare2`,
recommend Cutter for interactive graphs. Never claim Cutter ran here.
`gdy_search q=cutter rizin`.
