import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { brainProxyStatus, type AionBrainProxy } from "@/lib/claw/aion";

export async function denyUnlessAdmin() {
  if (!(await requireAdmin())) return unauthorized();
  return null;
}

export function brainResponse(result: AionBrainProxy, okStatus = 200) {
  return NextResponse.json(result, { status: brainProxyStatus(result, okStatus) });
}

export function brainProxyError(error: unknown, what: string) {
  return NextResponse.json({
    ok: false,
    source: "ccfl-proxy",
    owner: "aion-brain",
    trinity: "HOLD",
    error: error instanceof Error ? error.message : `${what} failed`,
  }, { status: 500 });
}
