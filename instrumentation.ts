export async function register(){
  if(process.env.NEXT_RUNTIME!=="nodejs")return;
  const [{startCalendarPublisherLoop},{startBlogAutopilotLoop},{startCampaignAutopilotLoop}]=await Promise.all([
    import("@/lib/calendar-publisher"),
    import("@/lib/blog-autopilot"),
    import("@/lib/campaign-autopilot")
  ]);
  startCalendarPublisherLoop();
  startBlogAutopilotLoop();
  startCampaignAutopilotLoop();
}
