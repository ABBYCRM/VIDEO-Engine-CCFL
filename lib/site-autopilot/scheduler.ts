import { runSiteAutopilotOnce } from "@/lib/site-autopilot/pipeline";
import { hasScheduledSiteRunToday } from "@/lib/site-autopilot/store";

let started = false;
let running = false;

async function tick() {
  if (running) return;
  if (hasScheduledSiteRunToday()) return; // once per UTC day, autonomously
  running = true;
  try {
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
