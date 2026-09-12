import { NextResponse } from "next/server";
import { aionCursorLaunch } from "@/lib/claw/aion";
import { requireAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain POST /api/cursor/launch. Brain owns the Cursor client. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const result = await aionCursorLaunch({
      prompt: body.prompt || body.goal || body.text,
      repo: body.repo || body.repository,
      repository: body.repository || body.repo,
      repos: body.repos,
      branch: body.branch,
      startingRef: body.startingRef,
      name: body.name,
      model: body.model,
      autoCreatePR: body.autoCreatePR,
      workOnCurrentBranch: body.workOnCurrentBranch,
      mode: body.mode,
    });
    const status = result.ok ? 202 : result.code === "AION_UNCONFIGURED" ? 503 : result.status && result.status >= 400 ? result.status : 400;
    return NextResponse.json(result, { status });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: "ccfl-proxy",
      owner: "aion-brain",
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor launch proxy failed",
    }, { status: 500 });
  }
}
