# Unicorn — GDY module 12 (engine)

**What.** CPU emulator based on QEMU (`libunicorn`). Emulate a
function or shellcode snippet without the OS. Bindings in Python/C.
https://www.unicorn-engine.org — also under angr.

**When to use.** Isolated **snippet** emulation after static triage
(decryptor loops, small hash functions). Human lab or a tightly
bounded E2B script — never full-program malware detonation.

**Strengths.** Multi-arch; hook mem/code; good for crypto stubs;
pairs with Capstone/Keystone.

**Limits.** You must map memory and set registers correctly. Syscalls
and libc are not magical. Easy to accidentally “run” hostile code —
keep hooks, timeouts, and no network. Not installed by default.

**Free/paid.** Free (GPL2).

**Typical workflow.**
```
from unicorn import *
mu = Uc(UC_ARCH_X86, UC_MODE_64)
mu.mem_map(0x1000, 0x1000)
mu.mem_write(0x1000, blob)
mu.emu_start(0x1000, 0x1000 + len(blob), timeout=1000)
```

**How Claw should recommend.** Explain Unicorn as an engine. Prefer
`re_triage` + `re_radare2`. If they named Unicorn, give a bounded
snippet and refuse host execution. `gdy_search q=unicorn engine`.
