// Hedra credential presence for Claw. Does not start video jobs — existing
// Hedra generation paths stay untouched.
export function isHedraConfigured(): boolean {
  return Boolean(process.env.HEDRA_API_KEY?.trim() || process.env.hedra_api_key?.trim());
}

export function hedraStatus() {
  return {
    configured: isHedraConfigured(),
    endpoint: "https://api.hedra.com/v3",
    note: isHedraConfigured()
      ? "Hedra key is present. Video generation stays on the existing one-shot Hedra path; Claw does not start extra jobs from chat."
      : "HEDRA_API_KEY is not set. Video generation that already uses Hedra is unchanged."
  };
}
