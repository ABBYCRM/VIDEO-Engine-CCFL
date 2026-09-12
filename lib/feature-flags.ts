// Runtime flags for the Claw-only console. Video / image-generation /
// Reddit-autopilot switches were removed with those products.

export const CLAW_ENABLED: boolean = process.env.CLAW_ENABLED !== "false";

export function isClawEnabled(): boolean {
  return CLAW_ENABLED;
}
