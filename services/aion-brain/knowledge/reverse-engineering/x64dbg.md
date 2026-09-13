# x64dbg — GDY module 12

**What.** Open-source Windows user-mode debugger (x32dbg + x64dbg).
https://x64dbg.com — snapshots, not vendored here. Not a Linux E2B
default.

**When to use.** Human **dynamic** debug of a Windows PE on an isolated
VM: breakpoints, trace, dump after unpack. Claw triage stays static;
point the operator at x64dbg only after they accept VM risk.

**Strengths.** Free; familiar Olly-like UI; plugins (Scylla, TitanHide
discussions are operator-lab topics); easy attach/launch.

**Limits.** Windows-only. Running unknown malware is detonation — never
on the Next.js host or a shared Droplet. No decompiler of Hex-Rays
quality. Anti-debug is common.

**Free/paid.** Free (GPLv3).

**Typical workflow (human, isolated VM).** Open x64dbg → File → Open
PE → run to entry / TLS → set bp on `VirtualAlloc` / `IsDebuggerPresent`
→ dump + static follow-up in r2/Ghidra.

**How Claw should recommend.** After `re_triage` shows a PE, say
dynamic debug is optional and must be on the operator’s isolated
Windows VM with x64dbg. Do not offer to “just run it.” `gdy_search q=x64dbg`.
