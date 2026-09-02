import { requireAdmin } from "@/lib/auth";
import { createConversation, getConversation } from "@/lib/claw/store";
import { runClawTurn, type ClawEvent } from "@/lib/claw/runtime";
import { isClawEnabled } from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: ClawEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// A tiny SSE comment can be buffered by an application proxy or compression
// middleware. Make the first chunk large enough to cross common proxy buffer
// thresholds while remaining an SSE comment that the browser ignores.
const SSE_PREAMBLE = `: connected ${" ".repeat(2048)}\n\n`;

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
  if (req.signal.aborted) ac.abort(req.signal.reason);
  else req.signal.addEventListener("abort", () => ac.abort(req.signal.reason), { once: true });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const enqueue = (value: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(value)); }
        catch { closed = true; }
      };
      const emit = (e: ClawEvent) => enqueue(sse(e));

      // Cross proxy/compression buffer thresholds before starting any slow
      // NVIDIA or tool work, then keep the connection active while it runs.
      enqueue(SSE_PREAMBLE);
      const heartbeat = setInterval(() => enqueue(": ping\n\n"), 5_000);

      void runClawTurn({ conversationId, text, fileIds, signal: ac.signal, onEvent: emit })
        .catch((e) => emit({ type: "error", error: e instanceof Error ? e.message : String(e) }))
        .finally(() => {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* client disconnected */ }
          }
        });
    },
    cancel(reason) {
      ac.abort(reason);
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive"
    }
  });
}
