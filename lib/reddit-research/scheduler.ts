import { runRedditMarketResearchOnce } from "@/lib/reddit-research/pipeline";
import { hasScheduledRunToday } from "@/lib/reddit-research/store";

let started = false;
let running = false;

async function tick() {
  if (running) return;
  if (hasScheduledRunToday()) return; // once per UTC day, autonomously
  running = true;
  try {
    await runRedditMarketResearchOnce("scheduled");
  } catch (e) {
    // runRedditMarketResearchOnce already saves failures to
    // reddit_research_runs; this catch only guards the interval itself
    // against an unexpected throw so the loop keeps ticking tomorrow.
    console.error("[reddit-research] scheduled run threw unexpectedly", e);
  } finally {
    running = false;
  }
}

export function startRedditResearchAutopilotLoop() {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  // Staggered against the other background loops (avatar watchdog, calendar
  // publisher, blog autopilot, campaign autopilot) so they don't all fire on
  // the same tick at boot. The `hasScheduledRunToday()` guard means the hourly
  // interval is just "check in until today's run has happened", not "run
  // hourly" — a fresh day's first tick is the one that actually does work.
  setTimeout(() => { void tick(); }, 10_000).unref?.();
  setInterval(() => { void tick(); }, 60 * 60 * 1000).unref?.();
}
