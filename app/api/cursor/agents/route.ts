import { NextResponse } from "next/server";
import { runCursorControl } from "@/lib/cursor";
import { denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alias of Brain-shaped /api/cursor + /api/cursor/launch. Still a proxy — no local Cursor client. */
export async function GET(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const result = await runCursorControl({
    op: url.searchParams.get("id") ? "status" : "list",
    id: url.searchParams.get("id") || undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    cursor: url.searchParams.get("cursor") || undefined,
  });
  const status = result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 400;
  return NextResponse.json(result, { status });
}

export async function POST(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const result = await runCursorControl({ ...body, op: body.op || "launch" });
  const status = result.ok ? 202 : result.code === "AION_UNCONFIGURED" ? 503 : 400;
  return NextResponse.json(result, { status });
}
