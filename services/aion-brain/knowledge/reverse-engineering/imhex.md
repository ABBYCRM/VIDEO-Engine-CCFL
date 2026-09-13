# ImHex — GDY module 12

**What.** Pattern-language hex editor (WerWolv). https://imhex.werwolv.net
Bookmarks, data inspector, disassembler helpers, pattern files for
structs. Not vendored here.

**When to use.** Unknown blobs, custom file formats, firmware dumps,
protocol buffers in hex, overlay inspection after `file` is “data”.
Complements r2 `px` when a human needs a GUI.

**Strengths.** Free; excellent pattern language; YARA-ish highlighting;
cross-platform; good for CTF format RE (not exploit writing here).

**Limits.** Not a full decompiler. Large files need a workstation.
Claw will not launch ImHex in E2B.

**Free/paid.** Free (GPLv2).

**Typical workflow.** Open file → set base/processor → write a pattern
(`struct Header { u32 magic; … }`) → jump to strings/imports if PE/ELF
parser patterns exist.

**How Claw should recommend.** After triage of a non-standard format,
recommend ImHex + a pattern. Use `re_triage` hex/entropy notes as the
starting map. `gdy_search q=ImHex`.
