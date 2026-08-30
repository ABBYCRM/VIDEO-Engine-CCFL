import { runSiteAutopilotOnce } from "@/lib/site-autopilot/pipeline";
import { hasScheduledSiteRunToday } from "@/lib/site-autopilot/store";

let started = false;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    // hasScheduledSiteRunToday() is a synchronous DB call and MUST live
    // inside this try: tick() is invoked fire-and-forget (`void tick()`),
    // and since Node 15 an unhandled promise rejection crashes the whole
    // process by default. A transient SQLite error here (SQLITE_BUSY from
    // one of the several other background loops writing concurrently, say)
    // would otherwise take down the entire server -- every autonomous
    // pipeline, not just this one -- instead of just skipping this one tick.
    if (hasScheduledSiteRunToday()) return; // once per UTC day, autonomously
    await runSiteAutopilotOnce("scheduled");
  } catch (e) {
    // runSiteAutopilotOnce already saves failures to site_autopilot_runs;
    // this catch only guards the interval itself against an unexpected
    // throw so the loop keeps ticking tomorrow.
    console.error("[site-autopilot] scheduled run threw unexpectedly", e);
  } finally {
    running = false;
  }
}

export function startSiteAutopilotLoop() {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  // Offset from the Reddit scheduler's own 10s/60min timing so the two
  // autonomous pipelines' first ticks at boot don't collide.
  setTimeout(() => { void tick(); }, 25_000).unref?.();
  setInterval(() => { void tick(); }, 60 * 60 * 1000).unref?.();
}
