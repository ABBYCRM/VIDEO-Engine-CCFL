import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { issueApiToken, listApiTokens } from "@/lib/tokens";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  return NextResponse.json({ tokens: listApiTokens() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const { name } = await req.json().catch(() => ({}));
  if (!String(name || "").trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  return NextResponse.json(issueApiToken(String(name).trim()), { status: 201 });
}
