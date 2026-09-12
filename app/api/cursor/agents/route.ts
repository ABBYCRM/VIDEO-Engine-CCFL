import { NextResponse } from "next/server";
import { runCursorControl } from "@/lib/cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusOf(result: { ok: boolean; code?: string; status?: number; trinity?: string }): number {
  if (result.status && result.status >= 400) return result.status;
  if (result.code === "MISSING_KEY") return 503;
  if (result.code === "BAD_ARGS") return 400;
  if (!result.ok) return 502;
  return result.trinity === "GO" && result.code === undefined ? 200 : 200;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    const result = await runCursorControl({
      op: id ? "status" : "list",
      id,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      includeArchived: url.searchParams.get("includeArchived") === "false" ? false : undefined,
    });
    const code = result.ok && !id ? 200 : statusOf(result);
    return NextResponse.json(result, { status: result.ok ? 200 : code });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor status failed",
      owner: "ccfl",
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "launch").toLowerCase();
    const result = await runCursorControl({
      ...body,
      op,
      prompt: body.prompt || body.goal || body.text,
      repo: body.repo || body.repository || body.url,
    });
    if (!result.ok) {
      const code = result.code === "MISSING_KEY" ? 503 : result.code === "BAD_ARGS" ? 400 : result.status && result.status >= 400 ? result.status : 502;
      return NextResponse.json(result, { status: code });
    }
    return NextResponse.json(result, { status: op === "launch" || op === "spawn" || op === "create" || op === "reply" ? 202 : 200 });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      trinity: "HOLD",
      error: e instanceof Error ? e.message : "cursor launch failed",
      owner: "ccfl",
    }, { status: 500 });
  }
}
