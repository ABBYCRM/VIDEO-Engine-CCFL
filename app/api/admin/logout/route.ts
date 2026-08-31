import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST() {
  const jar = await cookies();
  const sessionId = jar.get("claw_session")?.value;
  if (sessionId) {
    db.prepare("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(sessionId);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("claw_session", "", { maxAge: 0, path: "/" });
  return res;
}
