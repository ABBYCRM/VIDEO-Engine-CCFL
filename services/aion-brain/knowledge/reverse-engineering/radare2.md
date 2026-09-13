# radare2 (rada.re) — GDY module 12

**What.** Portable Unix-style reverse-engineering framework: `r2` CLI,
`radare2`, `rabin2`, `rahash2`, `rafind2`, `rasm2`. Site: https://rada.re
Upstream git is **not** vendored here.

**When to use.** Fast static triage in a sandbox: binary info, imports,
exports, strings, entropy, bounded disassembly. Default Claw path for
open-source RE **execution** (`re_radare2`).

**Strengths.** Scriptable (`-c`, r2pipe); tiny compared to Ghidra; works
headless; many formats; `aaa` analysis is one command.

**Limits.** Decompiler (r2dec / pdc) is weaker than Hex-Rays/Ghidra.
Steep CLI. Distro packages can be old. Install in E2B is **best-effort**
(`apt-get install radare2` or rizin fallback). Destructive `!shell`,
`w` writes, and debugger continue are **rejected** by Claw.

**Free/paid.** Free (LGPL).

**Typical workflow.**
```
r2 -A -q -c 'iI; iE; ii; iz' sample
# or: r2 -c 'aaa; iI; iE; ii; iz' -q sample
rabin2 -I -E -i -z sample
rahash2 -a sha256 sample
```
Seek + print: `s entry0; pd 32`. Never `!sh`, `wtf`, `ood; dc`.

**How Claw should invoke.** Call `re_radare2` with the default command
set. If r2 is missing in E2B, report best-effort and keep `re_triage`
Python notes. Do not run r2 on the Next.js host.
