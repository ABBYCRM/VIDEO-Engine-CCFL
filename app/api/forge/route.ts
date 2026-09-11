import { NextResponse } from "next/server";
import {
  cookiesForge,
  createForgeSession,
  forgeStatus,
  getForgeSession,
  handoffForge,
  listForgeSessions,
  navigateForge,
  probeForge,
  releaseForgeSession,
  resumeForge,
  scrapeWithForge,
  screenshotForge,
} from "@/lib/forge";
import type { ForgeHandoffReason } from "@/lib/forge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(forgeStatus());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "status failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "status");
    if (op === "status") return NextResponse.json(forgeStatus());
    if (op === "list") return NextResponse.json({ ok: true, sessions: listForgeSessions() });
    if (op === "create" || op === "boot") {
      const session = await createForgeSession(body);
      return NextResponse.json({ ok: true, session });
    }
    if (op === "get") return NextResponse.json({ ok: true, session: getForgeSession(body.id) });
    if (op === "navigate" || op === "open") {
      const session = await navigateForge(String(body.id || body.sessionId), body.url);
      return NextResponse.json({ ok: true, session });
    }
    if (op === "scrape") {
      const result = await scrapeWithForge({
        url: body.url,
        sessionId: body.sessionId || body.id,
        delayMs: body.delayMs,
        screenshot: body.screenshot !== false,
      });
      return NextResponse.json({ ok: result.scrape.ok, session: result.session, scrape: result.scrape });
    }
    if (op === "probe") {
      const result = await probeForge({ sessionId: body.sessionId || body.id, url: body.url });
      return NextResponse.json({ ok: result.probe.ok, session: result.session, probe: result.probe });
    }
    if (op === "screenshot") {
      const session = await screenshotForge(String(body.id || body.sessionId));
      return NextResponse.json({ ok: true, session });
    }
    if (op === "cookies") {
      const result = await cookiesForge(String(body.id || body.sessionId));
      return NextResponse.json({ ok: true, session: result.session, cookies: result.cookies });
    }
    if (op === "handoff") {
      const session = await handoffForge(String(body.id || body.sessionId), (body.reason || "manual") as ForgeHandoffReason);
      return NextResponse.json({ ok: true, session });
    }
    if (op === "resume") {
      const session = await resumeForge(String(body.id || body.sessionId));
      return NextResponse.json({ ok: true, session });
    }
    if (op === "release" || op === "kill") {
      const result = await releaseForgeSession(String(body.id || body.sessionId));
      return NextResponse.json({ ...result, sessions: listForgeSessions() });
    }
    if (op === "solve_captcha" || op === "inject_token") {
      return NextResponse.json({
        ok: false,
        error: "Forge does not solve, farm, or inject CAPTCHA tokens. Hand the same session to a human.",
      }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "unknown op" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "forge failed" }, { status: 500 });
  }
}
