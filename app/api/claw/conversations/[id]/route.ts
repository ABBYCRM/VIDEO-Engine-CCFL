import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteConversation, deleteMessage, getConversation, listMessages, renameConversation } from "@/lib/claw/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation, messages: listMessages(id) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.deleteMessageId) {
    if (!deleteMessage(String(body.deleteMessageId), id)) return NextResponse.json({ error: "Message not found in this thread" }, { status: 404 });
    return NextResponse.json({ ok: true, conversation: getConversation(id), messages: listMessages(id) });
  }
  if (body.title) {
    const conversation = renameConversation(id, String(body.title));
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ conversation });
  }
  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
