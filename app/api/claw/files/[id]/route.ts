import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteClawFile, getFile, renameClawFile } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const file = getFile(id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ file });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const file = renameClawFile(id, name);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ file });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteClawFile(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
