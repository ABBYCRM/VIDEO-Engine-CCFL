import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ conversations: listConversations() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conv = createConversation(String(body.title || "New thread"));
  return NextResponse.json({ conversation: conv }, { status: 201 });
}
