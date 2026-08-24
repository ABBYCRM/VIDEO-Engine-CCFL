export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ startCampaignAutopilotLoop }, { startCalendarPublisherLoop }] = await Promise.all([
    import("./lib/campaign-autopilot"),
    import("./lib/calendar-publisher")
  ]);

  startCampaignAutopilotLoop();
  startCalendarPublisherLoop();
}
