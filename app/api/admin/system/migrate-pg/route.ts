// Admin: apply pending PG migrations to novaluis-pg.
// Triggers lib/db-pg-bootstrap.applyMigrationsIfNeeded() which runs every
// 00X_*.sql file in /migrations that hasn't been recorded in _migrations.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyMigrationsIfNeeded, pingPg } from "@/lib/db-pg-bootstrap";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ping = await pingPg();
  if (!ping.ok) return NextResponse.json({ ok: false, stage: "ping", error: ping.error }, { status: 503 });
  const result = await applyMigrationsIfNeeded();
  if (result.error) return NextResponse.json({ ok: false, stage: "migrate", ...result }, { status: 500 });
  return NextResponse.json({ ok: true, ...result, dbName: ping.dbName });
}
