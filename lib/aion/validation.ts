// lib/aion/validation.ts
//
// Dependency-free validation for AION (operator directive 2026-08-30 — "New era
// marketing"). Rejects cycles, BigInt, functions, undefined, class instances,
// NaN, and infinite JSON values. Caps any single JSON payload at 32 KB.
//
// The repo has no Zod and we deliberately don't add it for one feature.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EpistemicCategory =
  | "OBSERVATION"
  | "INFERENCE"
  | "HYPOTHESIS"
  | "SPECULATION";

export type DecisionState = "COMMIT" | "DEFER" | "REJECT";

const SCOPE_RE = /^[a-zA-Z0-9._:-]{1,128}$/;
const MAX_JSON_BYTES = 32_768;

export function requireScopeId(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!SCOPE_RE.test(text)) {
    throw new Error(`AION_VALIDATION: invalid ${label}`);
  }
  return text;
}

export function requireText(
  value: unknown,
  label: string,
  max: number
): string {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) {
    throw new Error(`AION_VALIDATION: invalid ${label}`);
  }
  return text;
}

export function requireConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error("AION_VALIDATION: confidence must be between 0 and 1");
  }
  return n;
}

function assertJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`AION_VALIDATION: non-finite number at ${path}`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`AION_VALIDATION: non-JSON value at ${path}`);
  }
  if (seen.has(value)) {
    throw new Error(`AION_VALIDATION: circular value at ${path}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonValue(item, `${path}[${index}]`, seen)
    );
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`AION_VALIDATION: non-plain object at ${path}`);
    }
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function encodeJson(value: unknown): string {
  assertJsonValue(value, "$", new WeakSet());
  const encoded = JSON.stringify(value);
  const bytes = Buffer.byteLength(encoded, "utf8");
  if (bytes > MAX_JSON_BYTES) {
    throw new Error("AION_VALIDATION: JSON payload exceeds 32KB");
  }
  return encoded;
}
