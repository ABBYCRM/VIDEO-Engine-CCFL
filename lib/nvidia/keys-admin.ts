import { getNvidiaApiKeys, setNvidiaApiKeys } from "@/lib/nvidia/client";

export type KeyPoolPublic = { ok: true; count: number; configured: boolean };

export function publicKeyPoolView(keys: string[]): KeyPoolPublic {
  return { ok: true, count: keys.length, configured: keys.length > 0 };
}

export function readKeyPoolPublic(): KeyPoolPublic {
  try {
    return publicKeyPoolView(getNvidiaApiKeys());
  } catch {
    return { ok: true, count: 0, configured: false };
  }
}

function currentKeys(): string[] {
  try {
    return getNvidiaApiKeys();
  } catch {
    return [];
  }
}

export function applyKeyPoolMutation(body: unknown): KeyPoolPublic | { error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { error: "JSON body is required", status: 400 };
  }
  const input = body as { op?: string; key?: string; index?: number; keys?: unknown };

  if (input.op === "add") {
    if (typeof input.key !== "string" || input.key.trim().length < 8) {
      return { error: "key must be a Bitdeer API key string", status: 400 };
    }
    const key = input.key.trim();
    const existing = currentKeys();
    if (existing.includes(key)) return { error: "key already in pool", status: 409 };
    const next = [...existing, key];
    setNvidiaApiKeys(next);
    return publicKeyPoolView(next);
  }

  if (input.op === "remove") {
    if (!Number.isInteger(input.index)) return { error: "index must be an integer", status: 400 };
    const existing = currentKeys();
    if (input.index! < 0 || input.index! >= existing.length) {
      return { error: "index out of range", status: 400 };
    }
    const next = existing.filter((_, i) => i !== input.index);
    if (!next.length) return { error: "At least one NVIDIA API key is required", status: 400 };
    setNvidiaApiKeys(next);
    return publicKeyPoolView(next);
  }

  if (Array.isArray(input.keys) && input.keys.every((k) => typeof k === "string" && k.trim().length >= 8)) {
    const next = (input.keys as string[]).map((k) => k.trim());
    setNvidiaApiKeys(next);
    return publicKeyPoolView(next);
  }

  return { error: "keys must be an array of Bitdeer API key strings, or op=add|remove", status: 400 };
}

export function jsonContainsSecret(payload: unknown, secrets: string[]): boolean {
  const raw = JSON.stringify(payload);
  return secrets.some((secret) => secret.length >= 8 && raw.includes(secret));
}
