import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { auditWebsite, getStoredAudit } from "@/lib/site-audit";
import { getSite } from "@/lib/sites";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getSite(id)) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ audit: getStoredAudit(id) });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getSite(id)) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  try {
    const audit = await auditWebsite(id);
    return NextResponse.json({ audit });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
