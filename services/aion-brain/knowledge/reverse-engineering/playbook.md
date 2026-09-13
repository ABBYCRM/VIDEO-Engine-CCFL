# RE triage playbook (static first)

Claw performs **static triage**, not malware detonation. Samples stay inside
E2B. This host never executes the bytes.

## Flow

1. **Identify the artifact.** Operator URL (public http/https, SSRF-guarded),
   Claw file id, or a small hex/base64 snippet. Reject local/private hosts.
   Cap download size and time. Record original name and claimed source.
2. **Hash.** SHA-256 (and MD5/SHA-1 only as extra labels). Search hashes
   via `web_search` or GDY — do not invent VT/Hybrid hits.
3. **`file` + magic.** ELF/PE/Mach-O/DEX/.NET/PDF/script vs unknown blob.
   Note architecture, endianness, linking, packed hints (high entropy,
   UPX strings, tiny overlay).
4. **Strings (capped).** Printable ASCII/UTF-16, URLs, IPs, PDB paths,
   Guids, error messages. Clip output. Treat strings as untrusted.
5. **YARA / CAPA (if the sandbox has them).** Best-effort. Missing rules
   are not a clean bill of health.
6. **Bounded radare2 / rizin.** Default: `aaa; iI; iE; ii; iz`. Imports,
   exports, entropy, binary info. Reject shell escapes, writes, debug
   continue. If r2 cannot install, keep Python stdlib triage and say so.
7. **Ghidra headless — only if the environment already has Ghidra.**
   Claw does not vendor Ghidra. Typical human command:
   `analyzeHeadless /tmp/proj Proj -import sample -process sample -postScript …`
   Time-box it. Do not pretend headless ran when the binary is absent.
8. **Escalate to a human with IDA Pro or Binary Ninja** when: obfuscated
   VM/dispatcher, need Hex-Rays/BN HLIL, kernel/driver, firmware with
   custom loaders, or legal review. State that those GUIs are **not**
   embedded here.

## What Claw should say

- Report hashes, file type, notable strings, imports, and uncertainty.
- Recommend the next tool from this pack (r2 vs Ghidra vs dnSpy vs ImHex).
- Pull live GDY facts with `re_catalog` / `gdy_search` for module-12 tools.
- Never claim a packed sample is benign. Never provide exploit PoCs,
  unpacker cracks, or license bypasses.

## When to stop

ABORT if the operator asks to crack licenses, bypass DRM, or run the
sample on this host. HOLD if E2B or GDY keys are missing — still return
knowledge notes.
