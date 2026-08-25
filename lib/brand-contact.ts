/** Brand contact requirements enforced for every CaseClosedFL asset. */
export const CASE_CLOSED_URL = "CaseClosedFL.com";
export const CASE_CLOSED_PHONE = "(561) 566-1360";
export const CASE_CLOSED_PHONE_DIGITS = "5615661360";
export const CASE_CLOSED_SPOKEN_PHONE = "five six one, five six six, thirteen sixty";
export const BRAND_CAPTION_CTA = "Visit " + CASE_CLOSED_URL + " or call " + CASE_CLOSED_PHONE + " for a free consultation, no pressure.";

export function ensureBrandContactInCaption(value: string): string {
  let caption = String(value || "").trim();
  const hasUrl = /caseclosedfl\.com/i.test(caption);
  const hasPhone = caption.replace(/\D/g, "").includes(CASE_CLOSED_PHONE_DIGITS);
  if (!hasUrl || !hasPhone) caption += (caption ? "\n\n" : "") + BRAND_CAPTION_CTA;
  return caption.trim();
}

/** This fixed, short line prevents the generator from omitting the phone number. */
export function mandatoryPhoneVideoScript(): string {
  return "For help after an accident, call " + CASE_CLOSED_SPOKEN_PHONE + ".";
}

export function mandatoryVideoContactDirective(): string {
  return "MANDATORY BRAND CONTACT: the video must clearly say " + CASE_CLOSED_PHONE + " aloud as “" + CASE_CLOSED_SPOKEN_PHONE + "”. Show the same number as legible on-screen text. This is required, never optional.";
}
