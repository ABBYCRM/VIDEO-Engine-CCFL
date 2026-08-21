// Live-status pings. The Settings UI shows a green / amber / red dot next to
// every provider; this endpoint answers with the real outcome of hitting the
// provider's health URL with the configured key.
//
//   Green:  HTTP 2xx and the call returned within budget
//   Amber:  no key configured (the dot is empty)
//   Red:    HTTP non-2xx OR network error (key invalid / expired / blocked)
//
// We never throw to the client; we always return 200 with a per-provider
// shape, so the UI can light up the dots in any order.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getProviderKey, PROVIDERS, listProviderIds, type ProviderId } from "@/lib/providers";

type ProviderLive = {
  id: ProviderId;
  label: string;
  configured: boolean;
  live: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
};

function buildHeaders(p: ProviderId, key: string): Record<string, string> {
  if (p === "veo") {
    // Veo's "list models" endpoint takes the key as a query param. We use the
    // configured key directly to validate it.
    return { "Accept": "application/json" };
  }
  if (p === "grok") return { "Authorization": `Bearer ${key}`, "Accept": "application/json" };
  if (p === "a2e") return { "Authorization": `Bearer ${key}`, "Accept": "application/json" };
  // hedra uses "Authorization: Key <key>"
  return { "Authorization": `Key ${key}`, "Accept": "application/json" };
}

function buildUrl(p: ProviderId, key: string): string {
  if (p === "veo") {
    return PROVIDERS.veo.healthUrl.replace("__KEY__", encodeURIComponent(key));
  }
  return PROVIDERS[p].healthUrl;
}

async function pingOne(p: ProviderId): Promise<ProviderLive> {
  const def = PROVIDERS[p];
  const base = {
    id: p,
    label: def.label,
    configured: false,
    live: false,
    status: null as number | null,
    latencyMs: null as number | null,
    error: null as string | null,
    checkedAt: new Date().toISOString()
  };
  let key: string;
  try {
    key = getProviderKey(p);
  } catch {
    return { ...base, configured: false, error: "no key configured" };
  }
  const url = buildUrl(p, key);
  const headers = buildHeaders(p, key);
  const start = Date.now();
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000); // 8s per-provider budget
    const r = await fetch(url, { method: "GET", headers, cache: "no-store", signal: ac.signal });
    clearTimeout(t);
    const latency = Date.now() - start;
    return {
      ...base,
      configured: true,
      live: r.ok,
      status: r.status,
      latencyMs: latency,
      error: r.ok ? null : `HTTP ${r.status}`
    };
  } catch (e) {
    const latency = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    return { ...base, configured: true, live: false, latencyMs: latency, error: msg };
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await Promise.all(listProviderIds().map(pingOne));
  return NextResponse.json({ providers: results, checkedAt: new Date().toISOString() });
}
