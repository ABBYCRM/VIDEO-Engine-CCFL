import { requireAdmin } from "@/lib/auth";
import { createConversation, getConversation } from "@/lib/claw/store";
import { runClawTurn, type ClawEvent } from "@/lib/claw/runtime";
import { isClawEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: ClawEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  // Operator directive 2026-08-30: kill every Claw external connection.
  // CLAW_ENABLED=false short-circuits here so the request never opens
  // the SSE stream, never calls NVIDIA, never invokes a tool.
  if (!isClawEnabled()) {
    return new Response(
      JSON.stringify({ error: "Claw is disabled. Every external connection is disconnected. Set CLAW_ENABLED=true to re-enable.", feature: "claw", disabled: true }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }
  const body = await req.json().catch(() => ({}));
  let conversationId = body.conversationId ? String(body.conversationId) : "";
  if (conversationId && !getConversation(conversationId)) conversationId = "";
  if (!conversationId) conversationId = createConversation().id;
  const text = String(body.text || body.message || "");
  if (text.length > 12_000) return new Response(JSON.stringify({ error: "Message too large (12,000 characters max)" }), { status: 413, headers: { "content-type": "application/json" } });
  const requestedFileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds.map((id: unknown) => String(id)) : [];
  const fileIds: string[] = [...new Set(requestedFileIds)];
  if (fileIds.length > 8) return new Response(JSON.stringify({ error: "Attach at most 8 files per message" }), { status: 400, headers: { "content-type": "application/json" } });
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (e: ClawEvent) => controller.enqueue(enc.encode(sse(e)));
      // Flush real bytes to the client immediately, before ever calling
      // NVIDIA. Without this, time-to-first-byte is however long the first
      // upstream call takes (up to the 30-60s ceilings in lib/nvidia/client.ts,
      // or their sum on the stream-then-fallback path) with the client
      // seeing nothing at all — long enough to trip DigitalOcean App
      // Platform's own edge/gateway timeout and return a 504 before this
      // response ever gets a chance to answer. A comment line (SSE ignores
      // any line not starting with "data:") sent right away, plus a
      // heartbeat every 10s while we're waiting on a slow tool/LLM call,
      // keeps the connection actively streaming instead of silent.
      controller.enqueue(enc.encode(": connected\n\n"));
      const heartbeat = setInterval(() => {
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* stream already closed */ }
      }, 10_000);
      try {
        await runClawTurn({ conversationId, text, fileIds, signal: ac.signal, onEvent: emit });
      } catch (e) {
        emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}
