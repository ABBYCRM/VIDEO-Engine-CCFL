// Admin: run a tiny test query against PG to debug connectivity.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DATABASE_URL not set" });
  try {
    const postgres = (await import("postgres")).default;
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", onnotice: () => {}, max: 1, idle_timeout: 5, connect_timeout: 10 });
    const r = await sql`SELECT current_database() as db, current_user as usr, version() as v`;
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='_migrations' ORDER BY ordinal_position`;
    await sql.end({ timeout: 3 });
    return NextResponse.json({
      ok: true,
      db: r[0]?.db,
      user: r[0]?.usr,
      version: r[0]?.v?.slice(0, 80),
      tables: tables.map((t: any) => t.table_name),
      _migrations_columns: cols.map((c: any) => c.column_name)
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
