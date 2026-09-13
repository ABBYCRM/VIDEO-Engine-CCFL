import { NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ conversations: listConversations() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const conv = createConversation(String(body.title || "New thread"));
  return NextResponse.json({ conversation: conv }, { status: 201 });
}
