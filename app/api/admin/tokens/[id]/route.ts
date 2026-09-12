import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { revokeApiToken } from "@/lib/tokens";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  const { id } = await params;
  revokeApiToken(id);
  return NextResponse.json({ ok: true });
}
