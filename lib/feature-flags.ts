// Feature flags that can be flipped without redeploying.
//
// IMAGE_GEN_ENABLED — master switch for any code that calls an image generation
// provider (Hedra, A2E, Gemini, OpenAI, Grok image). When false, the create
// routes return 410 Gone and the UI hides every image-related control. All
// generation code is kept on disk so the operator can flip this back on later.
//
// Re-enabled by operator directive 2026-08-28, reversing the 2026-08-27
// "manual calendar only" pause. Defaults to on; set IMAGE_GEN_ENABLED=false
// to pause it again without a code change.

export const IMAGE_GEN_ENABLED: boolean = process.env.IMAGE_GEN_ENABLED !== "false";

/** True iff the current process is allowed to call an image-generation API. */
export function isImageGenEnabled(): boolean {
  return IMAGE_GEN_ENABLED;
}

/**
 * Build a standard 410 Gone response for routes that are intentionally disabled.
 * Includes a `feature` so the UI can surface the right message.
 */
export function imageGenDisabledResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "Image generation is disabled. The app is in manual-calendar mode. Set IMAGE_GEN_ENABLED=true to re-enable.",
      feature: "image_generation",
      disabled: true
    }),
    { status: 410, headers: { "content-type": "application/json" } }
  );
}
