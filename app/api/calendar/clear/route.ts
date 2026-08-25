import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = db.prepare("DELETE FROM scheduled_posts").run();
  return NextResponse.json({ ok: true, deleted: result.changes, message: `${result.changes} calendar items deleted.` });
}
