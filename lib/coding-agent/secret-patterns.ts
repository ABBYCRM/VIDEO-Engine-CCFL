// Pure, dependency-free secret-pattern redaction — no db/crypto imports, so
// this stays unit-testable under plain `node --test` (which has no loader
// for this repo's "@/" path aliases or extensionless relative imports).
// lib/coding-agent/secret-scrub.ts layers exact-match redaction of this
// app's actually-configured secrets on top of this.

const PATTERN_REDACTIONS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer ***"],
  [/(["']?(?:api[_-]?key|access[_-]?token|authorization|secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/-]{12,}(["']?)/gi, "$1***$2"],
  [/EAA[A-Za-z0-9]+/g, "EAA…"],
  [/IGQV[A-Za-z0-9]+/g, "IGQV…"],
  [/shpat_[A-Za-z0-9]+/g, "shpat_…"],
  [/ve_live_[A-Za-z0-9_-]+/g, "ve_live_…"]
];

export function redactSecretPatterns(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERN_REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
