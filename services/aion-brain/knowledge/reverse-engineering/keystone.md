# Keystone — GDY module 12 (engine)

**What.** Multi-arch assembler engine (sister to Capstone).
https://www.keystone-engine.org — encode mnemonics to bytes.

**When to use.** Operator needs to assemble a short instruction
sequence for a lab patch **they already have rights to test**, or to
understand encoding. Not for building exploits or license cracks.

**Strengths.** Same arch set philosophy as Capstone; Python/C bindings;
pairs with Unicorn for “assemble then emulate.”

**Limits.** Assembler only. Syntax differs slightly from Intel/NASM
by arch. Easy to misuse for offensive patching — Claw stays
descriptive.

**Free/paid.** Free (GPL2).

**Typical workflow.**
```
from keystone import *
ks = Ks(KS_ARCH_X86, KS_MODE_64)
encoding, count = ks.asm("inc rax; ret")
```

**How Claw should recommend.** Knowledge + tiny examples. Do not
offer packed shellcode. Point GDY: `gdy_search q=keystone engine`.
