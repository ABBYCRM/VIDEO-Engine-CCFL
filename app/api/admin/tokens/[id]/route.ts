import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revokeApiToken } from "@/lib/tokens";
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params; revokeApiToken(id); return NextResponse.json({ ok: true }); }
