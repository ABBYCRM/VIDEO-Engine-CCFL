export const INSTAGRAM_MEDIA_INSIGHT_METRICS = [
  "views",
  "reach",
  "likes",
  "comments",
  "saved",
  "shares"
] as const;

export function getComposioMediaInsightsArgs(mediaId: string) {
  const id = String(mediaId || "").trim();
  if (!id) throw new Error("mediaId is required");
  return {
    ig_media_id: id,
    metric: [...INSTAGRAM_MEDIA_INSIGHT_METRICS]
  };
}
