// lib/nvidia/request.ts — Claw-only.
//
// 2026-08-30 "Claw only" repo strip. The previous version of this file
// was a large typed builder for NVIDIA NIM chat requests; the parts
// the rest of the Claw-only build still need are applyThinkingMode()
// (called by client.ts) and one or two small helpers used by the
// content-writer / schemas. The heavy campaign-image / split-screen
// helpers are gone with the rest of the video stack.

/** Apply thinking-mode shaping to a request body. Kept for parity with
 *  the prior build; the current Claw models (qwen3-235b-a22b-instruct,
 *  llama-3.3-70b-instruct, etc.) do not need a think-prefix, so this
 *  is a no-op pass-through. */
export function applyThinkingMode(body: any, _thinking?: boolean): any {
  return body;
}
