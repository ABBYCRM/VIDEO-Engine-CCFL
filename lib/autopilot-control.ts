// Single, persisted, chat-controllable switch for every autonomous
// background pipeline (Reddit market-research, Site/IG autopilot, and any
// future one). Distinct from each pipeline's own env-var kill switch
// (REDDIT_AUTOPILOT_ENABLED, SITE_AUTOPILOT_ENABLED): those are an
// operator/ops-level hard disable that needs an env change; this is the
// operator's own runtime control — "stop" in Claw chat pauses every
// autonomous pipeline immediately and it stays paused (a DB setting, not
// in-memory state) until "start" resumes it, surviving restarts.
//
// Deliberately a single shared flag rather than one per pipeline: the
// operator thinks of "the autonomous system" as one thing to start or
// stop, not a per-pipeline switchboard.

import { db } from "@/lib/db";

const KEY = "autopilot_enabled";

export function isAutopilotEnabled(): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as { value: string } | undefined;
  return row ? row.value !== "false" : true; // unset = on by default
}

export function setAutopilotEnabled(enabled: boolean): void {
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run(KEY, enabled ? "true" : "false");
}
