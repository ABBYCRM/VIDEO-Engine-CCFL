// /api/admin/system — operator's dashboard for "what do I need to fix?"
//
// Returns the full system state in a single call:
//   - All 5 video provider keys (configured, live, latency, error)
//   - All 5 image/video model providers (gemini, openai, xai, etc.)
//   - Database (SQLite + PG if DATABASE_URL is set)
//   - App-level config (PUBLIC_BASE_URL, ADMIN_PASSWORD set, etc.)
//   - Stuck avatar generations (count per avatar)
//
// Designed for the operator's eyes — easy to scan, easy to know
// "raise the Gemini cap" vs "add the OpenAI key" vs "restart the
// app to recover stuck generations".

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { pingPg } from "@/lib/db-pg-bootstrap";
import { getProviderKey, PROVIDERS, type ProviderId } from "@/lib/providers";
import { getComposio, isComposioConfigured } from "@/lib/composio/client";
import { getGeminiApiKey } from "@/lib/settings";
import { getNvidiaApiKey } from "@/lib/nvidia";
import { getImageProvider, isImageProviderConfigured, getImageModel } from "@/lib/avatar-generation/client";
import { instagramHealthcheck, isInstagramConfigured } from "@/lib/instagram-graph";

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
    return { configured: false, live: false, error: `no ${PROVIDERS[provider].envKey} configured` };
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
  const r = await withTimeout(fetch(url, {
    method: isA2e ? "POST" : "GET",
    headers: isA2e ? { ...headers, "Content-Type": "application/json" } : headers,
    body: isA2e ? "{}" : undefined,
    cache: "no-store"
  }), TIMEOUT_MS);
  if (!r.ok) return { configured: true, live: false, error: r.error, latencyMs: Date.now() - t0 };
  const response = r.value as Response;
  return { configured: true, live: response.ok, status: response.status, error: response.ok ? undefined : `HTTP ${response.status}`, latencyMs: Date.now() - t0 };
}

async function pingNvidia() {
  let key: string;
  try {
    key = getNvidiaApiKey();
  } catch {
    return { configured: false, live: false, error: "no NVIDIA_API_KEY configured" };
  }
  const t0 = Date.now();
  const r = await withTimeout(fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }), TIMEOUT_MS);
  if (!r.ok) return { configured: true, live: false, error: r.error, latencyMs: Date.now() - t0 };
  const response = r.value as Response;
  return { configured: true, live: response.ok, status: response.status, error: response.ok ? undefined : `HTTP ${response.status}`, latencyMs: Date.now() - t0 };
}

async function pingGemini() {
  let key: string;
  try {
    key = getGeminiApiKey();
  } catch {
    return { configured: false, live: false, error: "no GEMINI_API_KEY configured" };
  }
  const t0 = Date.now();
  const r = await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`), TIMEOUT_MS);
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

async function pingComposio() {
  if (!isComposioConfigured()) return { configured: false, live: false, error: "no COMPOSIO_API_KEY env" };
  const t0 = Date.now();
  try {
    const client = getComposio();
    const r = await withTimeout(client.connectedAccounts.list({ userIds: ["admin"] }), TIMEOUT_MS);
    if (!r.ok) return { configured: true, live: false, error: r.error, latencyMs: Date.now() - t0 };
    return { configured: true, live: true, status: 200, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { configured: true, live: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
  }
}

async function pingInstagram() {
  if (!isInstagramConfigured()) return instagramHealthcheck();
  const t0 = Date.now();
  const result = await withTimeout(instagramHealthcheck(), TIMEOUT_MS);
  if (!result.ok) return { configured: true, live: false, error: result.error, latencyMs: Date.now() - t0 };
  return { ...result.value!, latencyMs: Date.now() - t0 };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t0 = Date.now();

  // Provider checks (parallel)
  const [veo, grok, a2e, hedra, nvidia, composio, gemini, pg, instagram] = await Promise.all([
    pingVideoProvider("veo"), pingVideoProvider("grok"), pingVideoProvider("a2e"), pingVideoProvider("hedra"), pingNvidia(), pingComposio(), pingGemini(), pingPg(), pingInstagram()
  ]);

  // Database (SQLite)
  let sqlite: { ok: boolean; path: string; error?: string };
  try {
    const r = db.prepare("SELECT COUNT(*) as n FROM settings").get() as { n: number };
    sqlite = { ok: true, path: process.env.DATABASE_PATH || "./data/video-engine.db" };
  } catch (e) {
    sqlite = { ok: false, path: process.env.DATABASE_PATH || "", error: e instanceof Error ? e.message : String(e) };
  }

  // Stuck avatar generations
  const stuck = db.prepare(`
    SELECT avatar_id, COUNT(*) as n
    FROM avatar_views
    WHERE generation_status='generating'
      AND (generation_started_at IS NULL OR generation_started_at < datetime('now', '-5 minutes'))
    GROUP BY avatar_id
  `).all() as Array<{ avatar_id: string; n: number }>;

  // Image API config (operator's own provider/model/key for the 4-view turnaround)
  const imageApi = {
    configured: isImageProviderConfigured(),
    provider: getImageProvider(),
    model: getImageModel()
  };

  // What the operator needs to fix
  const actions: string[] = [];
  if (!grok.configured) actions.push("Set XAI_API_KEY in DO env");
  if (!a2e.configured) actions.push("Set A2E_API_KEY in DO env");
  if (!hedra.configured) actions.push("Set HEDRA_API_KEY in DO env");
  if (!nvidia.configured) actions.push("Set NVIDIA_API_KEY in DO env");
  if (!instagram.configured) actions.push("Save Instagram Graph token + Business Account id on Integrations (instagram-mcp)");
  if (instagram.configured && !instagram.live) actions.push(`Instagram Graph live check failed: ${instagram.error || "unknown"}`);
  if (!gemini.configured) actions.push("Set GEMINI_API_KEY in DO env (required for Veo and recommended for AI 4-view turnaround)");
  if (gemini.configured && !gemini.live && gemini.error?.includes("spending cap")) actions.push("Raise Gemini spending cap in AI Studio (aistudio.google.com → Settings → Billing)");
  if (process.env.DATABASE_URL && !pg.ok) actions.push("Enable 'trusted sources' on novaluis-pg cluster in DO dashboard (or use private connection string)");
  if (stuck.length > 0) actions.push(`Reset ${stuck.length} stuck avatar generation(s): POST /api/admin/avatars/<id>/reset`);

  return NextResponse.json({
    ok: true,
    service: "VIDEO-Engine",
    durationMs: Date.now() - t0,
    providers: {
      veo,
      grok,
      a2e,
      hedra,
      nvidia,
      composio,
      gemini,
      instagram
    },
    instagram,
    imageApi,
    database: {
      sqlite,
      postgres: process.env.DATABASE_URL ? { ok: pg.ok, dbName: pg.dbName, error: pg.error } : null
    },
    app: {
      publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
      adminPasswordSet: Boolean(process.env.ADMIN_PASSWORD),
      encryptionKeySet: Boolean(process.env.APP_ENCRYPTION_KEY),
      sessionSecretSet: Boolean(process.env.SESSION_SECRET)
    },
    stuckAvatarGenerations: stuck,
    actions,
    nextSteps: [
      "If imageApi.configured is false, open /avatars and click 'Set image API key' in the top right",
      "If any provider is amber/red but the env is set, the operator-side cap/quota is exhausted — check the provider dashboard",
      "Once all listed providers are green AND imageApi.configured is true, generation and publishing are ready end-to-end"
    ]
  });
}
