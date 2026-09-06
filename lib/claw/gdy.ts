// GDY OSINT RAG — fail-soft, server-only keys, never logged.
// Env on DigitalOcean video-engine-ccfl: GDY_BASE_URL, GDY_API_BASE,
// GDY_API_KEY, GDY_API_KEY_ALT. Bearer auth. Paths are under /v1.

const TIMEOUT_MS = 20_000;

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

export function gdyApiBase(): string {
  const api = env("GDY_API_BASE").replace(/\/$/, "");
  if (api) return api;
  const host = env("GDY_BASE_URL").replace(/\/$/, "");
  return host ? `${host}/v1` : "";
}

export function gdyKeys(): string[] {
  return [env("GDY_API_KEY"), env("GDY_API_KEY_ALT")].filter(Boolean);
}

export function isGdyConfigured(): boolean {
  return Boolean(gdyApiBase() && gdyKeys().length);
}

function redact(text: string): string {
  let out = text;
  for (const key of gdyKeys()) {
    if (key.length >= 4) out = out.split(key).join("[redacted]");
  }
  return out;
}

function missing() {
  return {
    ok: false as const,
    error: "GDY is not configured.",
    code: "MISSING_KEY",
    hint: "Set GDY_API_KEY (and GDY_API_BASE or GDY_BASE_URL) on the server. GDY_API_KEY_ALT is an optional Bearer fallback."
  };
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function clip(value: unknown, max = 8_000): unknown {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= max) return value;
    const truncated = text.slice(0, max);
    return typeof value === "string"
      ? `${truncated}\n…[truncated]`
      : { truncated: true, preview: truncated };
  } catch {
    return value;
  }
}

export async function gdyGet(path: string, query?: Record<string, string>) {
  const base = gdyApiBase();
  const keys = gdyKeys();
  if (!base || !keys.length) return missing();

  const root = base.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${root}${suffix}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v) url.searchParams.set(k, v);
  }

  let lastError = "GDY request failed";
  for (let i = 0; i < keys.length; i++) {
    const res = await timedFetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${keys[i]}`,
        Accept: "application/json"
      }
    });
    const raw = await res.text().catch(() => "");
    const safe = redact(raw);
    if (res.status === 401 && i < keys.length - 1) {
      lastError = "GDY HTTP 401";
      continue;
    }
    if (!res.ok) {
      return { ok: false as const, error: `GDY HTTP ${res.status}`, code: "HTTP_ERROR", hint: safe.slice(0, 200) };
    }
    let data: unknown = safe;
    try { data = JSON.parse(safe); } catch { /* keep text */ }
    return { ok: true as const, via: "gdy", path: suffix, data: clip(data) };
  }
  return { ok: false as const, error: lastError, code: "HTTP_ERROR" };
}

export async function gdySearch(query: string) {
  const q = String(query || "").trim();
  if (!q) return { ok: false as const, error: "q is required", code: "BAD_ARGS" };
  return gdyGet("/search", { q });
}

export async function gdyRagContext(query: string) {
  const q = String(query || "").trim();
  if (!q) return { ok: false as const, error: "q is required", code: "BAD_ARGS" };
  return gdyGet("/rag/context", { q });
}

export async function gdyCategories() {
  return gdyGet("/categories");
}

export async function gdyTools() {
  return gdyGet("/tools");
}
