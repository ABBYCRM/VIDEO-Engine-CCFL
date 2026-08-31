// /api/health — Claw-only health check.
//
// 2026-08-30 "Claw only" repo strip. The previous version of this
// endpoint pinged every video provider, the Postgres mirror, and
// the Instagram Graph; all of those subsystems are gone now. What
// remains: the three external services Claw actually talks to
// (NVIDIA, Composio, Steel) plus the Claw chat tables count.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isNvidiaEnabled, getClawModel } from "@/lib/nvidia/client";
import { isComposioConfigured } from "@/lib/composio/client";
import { isSteelConfigured } from "@/lib/steel";

export const runtime = "nodejs";

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<{ ok: boolean; value?: T; error?: string }> {
  return await Promise.race([
    p.then(v => ({ ok: true as const, value: v })).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),
    new Promise<{ ok: false; error: string }>(r => setTimeout(() => r({ ok: false, error: `${label} timeout after ${ms}ms` }), ms))
  ]);
}

export async function GET() {
  const startedAt = Date.now();

  // 1. SQLite read
  const dbCheck = await withTimeout(
    Promise.resolve().then(() => {
      const row = db.prepare("SELECT COUNT(*) AS n FROM claw_conversations").get() as { n: number };
      return { conversations: row.n };
    }),
    3000,
    "db"
  );

  // 2. NVIDIA key presence (we don't actually call the LLM here — that's what
  // /api/ready is for; this is a liveness readback for the operator).
  const nvidia = { enabled: isNvidiaEnabled(), model: isNvidiaEnabled() ? getClawModel() : null };

  // 3. Composio / Steel
  const composio = { configured: isComposioConfigured() };
  const steel = { configured: isSteelConfigured() };

  return NextResponse.json({
    ok: true,
    service: "Honey Badger / Claw only",
    durationMs: Date.now() - startedAt,
    checks: {
      database: dbCheck.ok ? { ok: true, ...(dbCheck.value as object) } : { ok: false, error: dbCheck.error },
      nvidia,
      composio,
      steel
    }
  });
}
