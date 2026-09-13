# dnSpy — GDY module 12

**What.** .NET assembly editor/decompiler/debugger (dnSpy / dnSpyEx
forks). Reads PE + CLI metadata, C#/VB decompile, IL edit. Not
vendored here.

**When to use.** Sample `file` says PE32 + CLR / `.NET`, or strings
show `mscoree`, `System.Reflection`, `dnlib`. Faster than Ghidra for
managed code.

**Strengths.** Free; excellent C# decompile; debug managed processes
on Windows; edit-and-save assemblies (operator responsibility).

**Limits.** Useless for native-only PE. ConfuserEx / packed mixed-mode
needs unpack first. GUI is Windows-centric. Do not use Claw to produce
cracked assemblies.

**Free/paid.** Free (GPLv3 family, check the fork you download).

**Typical workflow.** Open DLL/EXE → Assembly Explorer → decompile
entry → search strings → (human) debugger. For CLI triage, `ilspycmd`
or `monodis` if present in a sandbox — not guaranteed.

**How Claw should recommend.** If `re_triage` detects .NET, recommend
dnSpyEx on a workstation and highlight managed strings/imports.
`gdy_search q=dnSpy`. Never offer license-bypass patches.
