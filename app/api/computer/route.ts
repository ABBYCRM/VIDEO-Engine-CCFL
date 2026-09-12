import { NextResponse } from "next/server";
import { ensureSession, getActiveSession, runAction, setControlOwner, takeOver, resetSession, stageUpload } from "@/lib/browser-computer";
import type { ComputerAction } from "@/lib/browser-computer";
import { searchViaSteel } from "@/lib/steel-search";
import { requireAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  try {
    return NextResponse.json({ ok: true, session: getActiveSession() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "status failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "boot");
    if (op === "boot") return NextResponse.json({ ok: true, session: await ensureSession() });
    if (op === "reset") return NextResponse.json({ ok: true, session: await resetSession() });
    if (op === "takeover") return NextResponse.json({ ok: true, session: await takeOver() });
    if (op === "resume") return NextResponse.json({ ok: true, session: await setControlOwner("AGENT") });
    if (op === "steel_search") {
      const query = String(body.query || getActiveSession()?.lastSearchQuery || "").trim();
      const steel = await searchViaSteel(query);
      return NextResponse.json({
        ok: steel.ok,
        via: steel.via,
        solvedCaptcha: steel.solvedCaptcha,
        results: steel.results,
        markdown: steel.markdown,
        error: steel.error,
        session: getActiveSession(),
      });
    }
    if (op === "upload") {
      const filename = String(body.filename || "");
      const raw = String(body.base64 || "");
      const buf = Buffer.from(raw, "base64");
      if (buf.length > 8_000_000) return NextResponse.json({ ok: false, error: "File is too large" }, { status: 400 });
      const artifact = stageUpload(filename, buf);
      return NextResponse.json({ ok: true, artifact, session: getActiveSession() });
    }
    if (op === "action") {
      const result = await runAction(body.action as ComputerAction, body.actor === "human" ? "human" : "agent");
      return NextResponse.json({ ok: result.ok, result, session: getActiveSession() });
    }
    return NextResponse.json({ ok: false, error: "unknown op" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "computer failed" }, { status: 500 });
  }
}
