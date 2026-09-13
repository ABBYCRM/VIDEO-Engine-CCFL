# Binary Ninja — GDY module 12 (paid, knowledge only)

**What.** Vector 35 Binary Ninja: commercial GUI + BNIL/HLIL/MLIL
intermediate languages, Python/C++ API, optional cloud/headless
editions. **Not embedded, not licensed, not vendored** here.

**When to use.** Human escalation when the operator’s shop standard is
BN (cleaner IL than raw asm, good Python API, snapshots). After Claw
triage, not instead of it.

**Strengths.** Modern UI; HN/ML/HL IL; side-by-side ILs; headless
available to licensees; strong scripting.

**Limits.** Paid (personal vs commercial). Cloud/headless is a
customer license. Free debugger-only or demo builds are still not
shipped in this repo.

**Free/paid.** Paid. Never claim Claw runs Binary Ninja or that a
license is present.

**Typical workflow (human).** Open file → analysis → HLIL pane →
Python console (`current_function.hlil`). Headless: `binaryninja`
Python `BinaryViewType.get_view_of_file`.

**How Claw should recommend.** “Use Binary Ninja on a licensed
workstation for HLIL.” Pull GDY facts with `gdy_search q=Binary Ninja`.
Offer `re_radare2` / Ghidra notes as the open-source path.
