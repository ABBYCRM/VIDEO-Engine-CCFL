# Claw reverse engineering (static triage)

VIDEO-Engine-CCFL does **not** ship Ghidra, IDA Pro, Binary Ninja, or
radare2 in the git tree. Claw **knows** those tools in micro-detail and
can **triage** samples in E2B.

## Knowledge pack

Source of truth (BOS-style corpus):

`services/aion-brain/knowledge/reverse-engineering/`

- `README.md` — authority table and tool map
- `playbook.md` — hash → file/strings → YARA/CAPA if present → r2 → optional Ghidra headless → human IDA/BN
- One note per GDY module-12 family: Ghidra, radare2, Rizin, Cutter, IDA Pro, Binary Ninja, x64dbg, dnSpy, ImHex, angr, Capstone, Keystone, Unicorn

Retrieve in chat:

- `re_knowledge` — local notes (no sample execution)
- `re_catalog` — live GDY Reverse Engineering / Binary Analysis (`gdy_search` / `gdy_categories`)
- Existing `gdy_search`, `gdy_rag_context`, `gdy_categories`, `gdy_tools`

## Practical tools (E2B only)

Untrusted bytes never run in the Next.js process.

| Tool | Ask Claw |
|------|----------|
| `re_triage` | “Triage this binary: https://… (static only)” or a Claw file id / hex / base64 snippet |
| `re_radare2` | “Run bounded r2: aaa; iI; iE; ii; iz on that sample” |
| `re_catalog` | “What does GDY list for reverse engineering?” |

`re_triage` computes sha256, `file`, capped strings, entropy notes.
`re_radare2` allowlists analysis commands and rejects `!`, writes, and debugger continue. If E2B cannot install radare2/rizin, triage still returns Python stdlib notes.

## Status

`app_status` / `connector_status` → `external.reverseEngineering` and
`connectors.reverseEngineering`: `{ knowledge: true, e2b, gdy }`.

`GET /api/health` includes `checks.gdy.configured`.

Live GDY (non-secret): `https://gdy-tool-directory-a6hzh.ondigitalocean.app`
(`GDY_BASE_URL` / `GDY_API_BASE=/v1`). Keys stay SECRET.
