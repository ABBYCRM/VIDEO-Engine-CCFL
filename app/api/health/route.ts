// /api/health — comprehensive liveness check
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pingPg } from "@/lib/db-pg-bootstrap";
import { getProviderKey, PROVIDERS, type ProviderId } from "@/lib/providers";
import { getGeminiApiKey } from "@/lib/settings";
import { getClawModel, getNvidiaApiKey } from "@/lib/nvidia";

const TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: boolean; value?: T; error?: string }> {
  return await Promise.race([
    p.then(v => ({ ok: true as const, value: v })).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
    new Promise<{ ok: false; error: string }>(r => setTimeout(() => r({ ok: false, error: `timeout after ${ms}ms` }), ms))
  ]);
}

async function pingVideoProvider(provider: ProviderId) {
  let key: string;
  try {
    key = getProviderKey(provider);
  } catch {
    return { configured: false, live: false, error: "no key configured" };
  }

  const url = provider === "veo"
    ? PROVIDERS.veo.healthUrl.replace("__KEY__", encodeURIComponent(key))
    : PROVIDERS[provider].healthUrl;
  const headers: Record<string, string> = provider === "veo"
    ? { Accept: "application/json" }
    : provider === "hedra"
      ? { Authorization: `Key ${key}`, Accept: "application/json" }
      : { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const isA2e = provider === "a2e";
  const t0 = Date.now();
  const r = await withTimeout(
    fetch(url, {
      method: isA2e ? "POST" : "GET",
      headers: isA2e ? { ...headers, "Content-Type": "application/json" } : headers,
      body: isA2e ? "{}" : undefined,
      cache: "no-store"
    }),
    TIMEOUT_MS
  );
  if (!r.ok) return { configured: true, live: false, error: r.error, latencyMs: Date.now() - t0 };
  const response = r.value as Response;
  return {
    configured: true,
    live: response.ok,
    status: response.status,
    error: response.ok ? undefined : `HTTP ${response.status}`,
    latencyMs: Date.now() - t0
  };
}

async function pingNvidia() {
  const model = getClawModel();
  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch {
    return { configured: false, live: false, model, error: "no key configured" };
  }
  const t0 = Date.now();
  const r = await withTimeout(
    fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }),
    TIMEOUT_MS
  );
  if (!r.ok) return { configured: true, live: false, model, error: r.error, latencyMs: Date.now() - t0 };
  const response = r.value as Response;
  const catalog = response.ok
    ? await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null
    : null;
  const modelIds = catalog?.data?.map(entry => entry.id).filter((id): id is string => Boolean(id)) || [];
  const available = modelIds.length ? modelIds.includes(model) : undefined;
  const alternatives = available === false
    ? modelIds.filter(id => /(?:nemotron|llama|mistral)/i.test(id)).slice(0, 30)
    : undefined;
  return {
    configured: true,
    live: response.ok && available !== false,
    status: response.status,
    model,
    available,
    alternatives,
    error: !response.ok ? `HTTP ${response.status}` : available === false ? "configured model is unavailable" : undefined,
    latencyMs: Date.now() - t0
  };
}

async function pingComposio() {
  const { getComposio, isComposioConfigured } = await import("@/lib/composio/client");
  const configured = isComposioConfigured();
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  try {
    const client = getComposio();
    const r = await withTimeout(client.connectedAccounts.list({ userIds: ["admin"] }), TIMEOUT_MS);
    if (!r.ok) return { configured, live: false, error: r.error, latencyMs: Date.now() - t0 };
    return { configured, live: true, status: 200, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { configured, live: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
  }
}

async function pingGemini() {
  let key: string;
  try {
    key = getGeminiApiKey();
  } catch {
    return { configured: false, live: false, error: "no key configured" };
  }
  const t0 = Date.now();
  const r = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`),
    TIMEOUT_MS
  );
  if (!r.ok) {
    return { configured: true, live: false, error: r.error || "models endpoint failed", latencyMs: Date.now() - t0 };
  }
  const response = r.value as Response;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const isCap = body.includes("RESOURCE_EXHAUSTED") || body.includes("spending cap");
    return { configured: true, live: false, status: response.status, error: isCap ? "monthly spending cap reached" : `HTTP ${response.status}`, latencyMs: Date.now() - t0 };
  }
  return { configured: true, live: true, status: response.status, latencyMs: Date.now() - t0 };
}

export async function GET() {
  const t0 = Date.now();
  const [veo, grok, a2e, hedra, nvidia, composio, gemini, pg] = await Promise.all([
    pingVideoProvider("veo"), pingVideoProvider("grok"), pingVideoProvider("a2e"), pingVideoProvider("hedra"), pingNvidia(), pingComposio(), pingGemini(), pingPg()
  ]);

  let dbCheck: { ok: boolean; engine: "sqlite" | "none"; path: string; error?: string };
  try {
    const r = db.prepare("SELECT 1 as one").get();
    dbCheck = r ? { ok: true, engine: "sqlite", path: process.env.DATABASE_PATH || "./data/video-engine.db" } : { ok: false, engine: "sqlite", path: process.env.DATABASE_PATH || "", error: "no rows" };
  } catch (e) {
    dbCheck = { ok: false, engine: "sqlite", path: process.env.DATABASE_PATH || "", error: e instanceof Error ? e.message : String(e) };
  }

  if (process.env.DATABASE_URL) {
    const pgSide: { ok: boolean; engine: "postgres"; error?: string; dbName?: string } = {
      ok: pg.ok,
      engine: "postgres",
      error: pg.error,
      dbName: pg.dbName
    };
    return NextResponse.json({
      ok: dbCheck.ok && pg.ok,
      service: "VIDEO-Engine",
      durationMs: Date.now() - t0,
      checks: {
        app: { ok: true },
        database: dbCheck,
        database_postgres: pgSide,
        providers: { veo, grok, a2e, hedra, nvidia, composio, gemini }
      }
    });
  }

  return NextResponse.json({
    ok: dbCheck.ok,
    service: "VIDEO-Engine",
    durationMs: Date.now() - t0,
    checks: {
      app: { ok: true },
      database: dbCheck,
      providers: { veo, grok, a2e, hedra, nvidia, composio, gemini }
    }
  });
}
