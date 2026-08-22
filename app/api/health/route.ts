// /api/health — comprehensive liveness check
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pingPg } from "@/lib/db-pg-bootstrap";

const TIMEOUT_MS = 6000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: boolean; value?: T; error?: string }> {
  return await Promise.race([
    p.then(v => ({ ok: true as const, value: v })).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
    new Promise<{ ok: false; error: string }>(r => setTimeout(() => r({ ok: false, error: `timeout after ${ms}ms` }), ms))
  ]);
}

async function pingVeo() {
  const configured = Boolean(process.env.VEO_API_KEY);
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  return { configured: true, live: true, status: 200, latencyMs: 0 };
}

async function pingGrok() {
  const configured = Boolean(process.env.XAI_API_KEY);
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  const r = await withTimeout(
    fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` } }),
    TIMEOUT_MS
  );
  if (!r.ok) return { configured, live: false, error: r.error || "models endpoint failed", latencyMs: Date.now() - t0 };
  return { configured, live: true, status: 200, latencyMs: Date.now() - t0 };
}

async function pingHedra() {
  const configured = Boolean(process.env.HEDRA_API_KEY);
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  const authHeader = `Basic ${Buffer.from(process.env.HEDRA_API_KEY || "").toString("base64")}`;
  const r = await withTimeout(
    fetch("https://api.hedra.com/v1/models", { headers: { "X-API-Key": process.env.HEDRA_API_KEY || "", Authorization: authHeader } }),
    TIMEOUT_MS
  );
  if (!r.ok) return { configured, live: false, error: r.error, latencyMs: Date.now() - t0 };
  const status = (r.value as Response).status;
  return { configured, live: status === 200, status, latencyMs: Date.now() - t0 };
}

async function pingNvidia() {
  const configured = Boolean(process.env.NVIDIA_API_KEY);
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  const r = await withTimeout(
    fetch("https://integrate.api.nvidia.com/v1/models", { headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` } }),
    TIMEOUT_MS
  );
  if (!r.ok) return { configured, live: false, error: r.error, latencyMs: Date.now() - t0 };
  const status = (r.value as Response).status;
  return { configured, live: status === 200, status, latencyMs: Date.now() - t0 };
}

async function pingComposio() {
  const { isComposioConfigured } = await import("@/lib/composio/client");
  const configured = isComposioConfigured();
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  try {
    const { Composio } = await import("@composio/core");
    const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const r = await withTimeout(client.connectedAccounts.list({ userIds: ["admin"] }), TIMEOUT_MS);
    if (!r.ok) return { configured, live: false, error: r.error, latencyMs: Date.now() - t0 };
    return { configured, live: true, status: 200, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { configured, live: false, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
  }
}

async function pingGemini() {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  if (!configured) return { configured: false, live: false, error: "no key configured" };
  const t0 = Date.now();
  const r = await withTimeout(
    fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`),
    TIMEOUT_MS
  );
  if (!r.ok) {
    const body = await (r.value as Response).text().catch(() => "");
    const isCap = body.includes("RESOURCE_EXHAUSTED") || body.includes("spending cap");
    return { configured, live: false, error: isCap ? "monthly spending cap reached" : (r.error || "models list failed"), latencyMs: Date.now() - t0 };
  }
  return { configured, live: true, status: 200, latencyMs: Date.now() - t0 };
}

export async function GET() {
  const t0 = Date.now();
  const [veo, grok, hedra, nvidia, composio, gemini, pg] = await Promise.all([
    pingVeo(), pingGrok(), pingHedra(), pingNvidia(), pingComposio(), pingGemini(), pingPg()
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
        providers: { veo, grok, hedra, nvidia, composio, gemini }
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
      providers: { veo, grok, hedra, nvidia, composio, gemini }
    }
  });
}
