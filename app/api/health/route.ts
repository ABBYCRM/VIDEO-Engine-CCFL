// /api/health — Claw-only health check. Never includes secret values.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clawProviderStatus } from "@/lib/claw/provider-status";

export const runtime = "nodejs";

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<{ ok: boolean; value?: T; error?: string }> {
  return await Promise.race([
    p.then(v => ({ ok: true as const, value: v })).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
    new Promise<{ ok: false; error: string }>(r => setTimeout(() => r({ ok: false, error: `${label} timeout after ${ms}ms` }), ms))
  ]);
}

export async function GET() {
  const startedAt = Date.now();
  const dbCheck = await withTimeout(
    Promise.resolve().then(() => {
      const row = db.prepare("SELECT COUNT(*) AS n FROM claw_conversations").get() as { n: number };
      return { conversations: row.n };
    }),
    3000,
    "db"
  );
  const claw = clawProviderStatus();
  return NextResponse.json({
    ok: true,
    service: "Honey Badger / Claw only",
    durationMs: Date.now() - startedAt,
    checks: {
      database: dbCheck.ok ? { ok: true, ...(dbCheck.value as object) } : { ok: false, error: dbCheck.error },
      nvidia: claw.nvidia,
      tools: claw.tools,
      providers: claw.providers
    }
  });
}
