import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { applyKeyPoolMutation, readKeyPoolPublic } from "@/lib/nvidia/keys-admin";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  return NextResponse.json(readKeyPoolPublic());
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await req.json().catch(() => null);
  const result = applyKeyPoolMutation(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
