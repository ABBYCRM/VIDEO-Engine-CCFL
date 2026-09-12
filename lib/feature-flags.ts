// Feature flags that can be flipped without redeploying.

export const IMAGE_GEN_ENABLED: boolean = process.env.IMAGE_GEN_ENABLED !== "false";

/** True iff the current process is allowed to call an image-generation API. */
export function isImageGenEnabled(): boolean {
  return IMAGE_GEN_ENABLED;
}

export const CLAW_ENABLED: boolean = process.env.CLAW_ENABLED !== "false";

export function isClawEnabled(): boolean {
  return CLAW_ENABLED;
}
