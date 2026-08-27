// Feature flags that can be flipped without redeploying.
//
// IMAGE_GEN_ENABLED — master switch for any code that calls an image generation
// provider (Hedra, A2E, Gemini, OpenAI, Grok image). When false, the create
// routes return 410 Gone and the UI hides every image-related control. All
// generation code is kept on disk so the operator can flip this back on later.
//
// Operator's directive 2026-08-27: "shut down the image generator at this app.
// we will only be using the manual calendar from now on. leave the app as is
// just disconnect the image gen so no more surprises arrive."

export const IMAGE_GEN_ENABLED: boolean = process.env.IMAGE_GEN_ENABLED === "true";

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
