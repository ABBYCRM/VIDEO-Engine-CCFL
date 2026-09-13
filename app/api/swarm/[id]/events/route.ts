import { getEvents, snapshot } from "@/lib/swarm/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = snapshot(id);
  if (!run) return new Response(JSON.stringify({ ok: false, error: "Unknown run" }), { status: 404 });

  const encoder = new TextEncoder();
  let last = 0;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: "hello", runId: id, status: run.status });
      while (!req.signal.aborted) {
        const events = getEvents(id).filter((e) => e.at > last);
        for (const event of events) {
          last = event.at;
          send({ type: "event", event });
        }
        const live = snapshot(id);
        if (live && ["completed", "failed", "cancelled"].includes(live.status)) {
          send({ type: "done", run: live });
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
