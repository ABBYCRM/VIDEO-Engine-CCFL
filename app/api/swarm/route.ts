import { NextResponse } from "next/server";
import { cancelSwarm, getSwarm, listSwarm, startSwarmRun, swarmStatus } from "@/lib/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const run = getSwarm(id);
      if (!run) return NextResponse.json({ ok: false, error: "Unknown run" }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }
    if (url.searchParams.get("list") === "1") {
      return NextResponse.json({ ok: true, runs: listSwarm() });
    }
    return NextResponse.json(swarmStatus());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "status failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "status");
    if (op === "status") return NextResponse.json(swarmStatus());
    if (op === "list") return NextResponse.json({ ok: true, runs: listSwarm() });
    if (op === "get") {
      const run = getSwarm(String(body.id || body.runId || ""));
      if (!run) return NextResponse.json({ ok: false, error: "Unknown run" }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }
    if (op === "create" || op === "run") {
      const result = startSwarmRun({
        objective: String(body.objective || body.goal || ""),
        limits: {
          maxAgents: body.maxAgents ?? body.max_subagents,
          deadlineMs: body.deadlineMs ?? (body.deadline_seconds ? Number(body.deadline_seconds) * 1000 : undefined),
        },
      });
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (op === "cancel") {
      const run = cancelSwarm(String(body.id || body.runId || ""));
      if (!run) return NextResponse.json({ ok: false, error: "Unknown run" }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }
    return NextResponse.json({ ok: false, error: "unknown op. Use status, list, get, create, cancel." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "swarm failed" }, { status: 500 });
  }
}
