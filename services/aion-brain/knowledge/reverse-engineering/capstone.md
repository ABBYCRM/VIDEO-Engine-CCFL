# Capstone — GDY module 12 (engine)

**What.** Lightweight multi-arch disassembly engine (`libcapstone`,
bindings for Python/C/Rust/Go). Used *inside* r2, Ghidra loaders,
angr, and countless tools. https://www.capstone-engine.org

**When to use.** You need raw disassembly of a buffer (shellcode
snippet, overlay) without a full SRE suite. Claw hex snippets can be
disassembled in E2B with `python3` + capstone **if** the package
exists; otherwise recommend r2 `pd`.

**Strengths.** Fast; many ISAs (x86, ARM, MIPS, PPC, RISC-V, …);
stable C API.

**Limits.** Disassembly only — no IL, no loader, no decompiler. Wrong
mode (16/32/64, thumb) yields garbage. Not a product UI.

**Free/paid.** Free (BSD).

**Typical workflow.**
```
from capstone import *
md = Cs(CS_ARCH_X86, CS_MODE_64)
for i in md.disasm(blob, 0x1000):
    print(f"0x{i.address:x}: {i.mnemonic} {i.op_str}")
```

**How Claw should recommend.** Treat Capstone as the engine behind
other tools. For operators: “use r2/Ghidra; they already call a
disassembler.” Optional Python snippet if they named Capstone.
`gdy_search q=capstone`.
