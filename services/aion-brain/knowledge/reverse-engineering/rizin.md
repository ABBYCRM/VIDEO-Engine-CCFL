# Rizin — GDY module 12

**What.** radare2 fork focused on a cleaner core, Cutter as the primary
GUI, and `rizin` / `rz-bin` / `rz-hash` / `rz-asm` CLIs.
https://rizin.re — not vendored in this repo.

**When to use.** Same jobs as r2 when the sandbox has `rizin` but not
`radare2`, or the operator named Rizin. Cutter is the GUI escalation
(see `cutter.md`).

**Strengths.** Active fork; better defaults for many users; Cutter
integration; rzpipe; similar command language to r2 (`aaa`, `iI`, `ii`).

**Limits.** Command dialect is close but not identical to r2. Packages
may be `rizin` not `radare2`. Still no Hex-Rays-class decompiler in the
core (use rz-ghidra plugin on a human box if installed).

**Free/paid.** Free (LGPL).

**Typical workflow.**
```
rizin -A -q -c 'iI; iE; ii; iz' sample
rz-bin -I -E -i -z sample
rz-hash -a sha256 sample
```

**How Claw should invoke.** `re_radare2` already tries `r2` then `rizin`.
Prefer quoting `rz-bin` for format dumps when rizin is what installed.
`gdy_search q=rizin`.
