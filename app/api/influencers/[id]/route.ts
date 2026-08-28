import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteInfluencer, getInfluencer, listOutreach, updateInfluencerStatus } from "@/lib/influencers";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const influencer = getInfluencer(id);
  if (!influencer) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  return NextResponse.json({ influencer, outreach: listOutreach(id) });
}

/** Body: { status?: "prospect"|"contacted"|"negotiating"|"active"|"declined", notes? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const influencer = updateInfluencerStatus(id, body?.status || getInfluencer(id)?.status || "prospect", body?.notes);
    if (!influencer) return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
    return NextResponse.json({ influencer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ ok: deleteInfluencer(id) });
}
