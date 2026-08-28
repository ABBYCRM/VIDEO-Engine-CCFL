import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendOutreach } from "@/lib/influencer-outreach";

/** Body: { channel: "email"|"instagram_dm", brandContext?, proposal?, emailFrom?, instagramIgsid? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel === "email" ? "email" : "instagram_dm";
  try {
    const result = await sendOutreach({
      influencerId: id,
      channel,
      brandContext: body?.brandContext ? String(body.brandContext) : null,
      proposal: body?.proposal ? String(body.proposal) : null,
      emailFrom: body?.emailFrom ? String(body.emailFrom) : undefined,
      instagramIgsid: body?.instagramIgsid ? String(body.instagramIgsid) : null
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
