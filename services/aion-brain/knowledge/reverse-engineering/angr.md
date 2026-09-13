# angr — GDY module 12

**What.** Python binary analysis platform (UC Santa Barbara / angr
org): loading, CFG, symbolic execution, claripy constraints.
`pip install angr` — heavy; optional in E2B, **not** a default Claw
install.

**When to use.** Path-recovery / constraint questions on a small
unpacked binary the operator already trusts enough to analyze
symbolically. After static triage. Not for “run this malware.”

**Strengths.** Scriptable CFG + symbolic exec; good teaching tool;
works on ELF/PE in Python.

**Limits.** Slow; memory hungry; explodes on obfuscated/packed code;
needs the `angr` wheel + Unicorn/Capstone stack. E2B may fail to
install in time. Not a substitute for Ghidra decompile.

**Free/paid.** Free (BSD).

**Typical workflow (lab).**
```
import angr
p = angr.Project("sample", auto_load_libs=False)
st = p.factory.entry_state()
sim = p.factory.simgr(st)
sim.explore(find=0x401000)
```
Always `auto_load_libs=False` unless the operator asked otherwise.

**How Claw should recommend.** Mention angr for symbolic follow-up.
Do not silently `pip install` huge stacks unless `re_radare2` /
explicit operator ask and E2B time remains. `gdy_search q=angr`.
