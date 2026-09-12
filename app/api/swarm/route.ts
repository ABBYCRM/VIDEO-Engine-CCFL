import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import {
  cancelSwarm,
  cleanupSwarm,
  completeSwarm,
  getSwarm,
  listSwarm,
  messageSwarm,
  spawnEphemeralAgent,
  startSwarmRun,
  stopSwarmTask,
  swarmStatus,
  waitSwarmTask,
} from "@/lib/swarm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
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
  if (!(await requireAdmin())) return unauthorized();
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
      return NextResponse.json(result, { status: 202 });
    }
    if (op === "spawn") {
      const result = spawnEphemeralAgent({
        runId: body.runId || body.id,
        goal: String(body.goal || body.objective || body.task || ""),
        context: body.context,
        tools: body.tools,
        successCriteria: body.successCriteria ?? body.criteria,
        label: body.label,
        preset: body.preset || body.role,
        role: body.role,
        runner: body.runner === "aion" ? "aion" : "local",
        urls: body.urls,
        dependsOn: body.dependsOn,
        parentId: body.parentId,
        ephemeral: body.ephemeral,
      });
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result, { status: 202 });
    }
    if (op === "stop") {
      const result = stopSwarmTask({
        runId: String(body.runId || body.id || ""),
        taskId: String(body.taskId || ""),
      });
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (op === "cleanup") {
      const result = cleanupSwarm({
        runId: String(body.runId || body.id || ""),
        taskId: body.taskId ? String(body.taskId) : undefined,
        deleteRun: body.deleteRun === true,
      });
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (op === "wait") {
      const result = await waitSwarmTask({
        runId: String(body.runId || body.id || ""),
        taskId: String(body.taskId || ""),
        timeoutMs: body.timeoutMs,
      });
      return NextResponse.json(result);
    }
    if (op === "message") {
      const result = messageSwarm({
        runId: String(body.runId || body.id || ""),
        taskId: body.taskId,
        body: String(body.body || body.message || ""),
      });
      if (!result.ok) return NextResponse.json(result, { status: 400 });
      return NextResponse.json(result);
    }
    if (op === "complete") {
      const run = completeSwarm({ runId: String(body.runId || body.id || ""), answer: body.answer });
      if (!run) return NextResponse.json({ ok: false, error: "Unknown run" }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }
    if (op === "cancel") {
      const run = cancelSwarm(String(body.id || body.runId || ""));
      if (!run) return NextResponse.json({ ok: false, error: "Unknown run" }, { status: 404 });
      return NextResponse.json({ ok: true, run });
    }
    return NextResponse.json({ ok: false, error: "unknown op. Use status, list, get, create, spawn, wait, message, stop, cleanup, complete, cancel." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "swarm failed" }, { status: 500 });
  }
}
