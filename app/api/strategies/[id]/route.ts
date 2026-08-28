import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteStrategy, getStrategy, listStrategyRevisions, updateStrategy } from "@/lib/strategies";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const strategy = getStrategy(id);
  if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  return NextResponse.json({ strategy, revisions: listStrategyRevisions(id) });
}

/** Body: { title?, horizon?, goals?, channelMix?, contentPillars?, rationale?, status? }
 *  Pass status:"approved" to approve. Every PATCH is recorded as a revision. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const strategy = updateStrategy(id, body);
  if (!strategy) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  return NextResponse.json({ strategy });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ ok: deleteStrategy(id) });
}
