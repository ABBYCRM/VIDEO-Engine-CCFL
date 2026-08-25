import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";
import { visualTemplates } from "@/lib/visual-templates";
import { mandatoryPhoneVideoScript, mandatoryVideoContactDirective } from "@/lib/brand-contact";

const MAX_CHARS = 3400;

export type LanguageMode = "english" | "spanish" | "mixed";

export function getLanguageInstruction(mode: LanguageMode): string {
  switch (mode) {
    case "spanish":
      return "ALL dialogue, text overlays, and spoken content must be in Spanish. Natural Mexican-Spanish pronunciation and colloquialisms.";
    case "mixed":
      return "MIX Spanish and English naturally throughout. Use Spanglish code-switching — start sentences in one language and finish in the other, or alternate phrases. Authentic bilingual Latino/a speech patterns. Some sentences fully in Spanish, others fully in English, many mixing both.";
    default:
      return "ALL dialogue and spoken content must be in English. Natural American English pronunciation.";
  }
}

function getTemplateHint(templateId?: string): string {
  if (!templateId || templateId === "auto") return "";
  const tmpl = visualTemplates.find(t => t.id === templateId);
  if (!tmpl || !("promptHint" in tmpl) || !tmpl.promptHint) return "";
  return `VISUAL STYLE: ${tmpl.promptHint}. The subject should be framed within the scene naturally, as if recorded on a smartphone in this environment.`;
}

/** Calibrate script for 8-second delivery at ~130-150 WPM = ~17-20 words max */
function calibrateScript(script?: string): { script: string; warning: string } {
  if (!script?.trim()) return { script: "", warning: "" };
  const words = script.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount <= 20) return { script: script.trim(), warning: "" };
  const truncated = words.slice(0, 20).join(" ") + "...";
  return {
    script: truncated,
    warning: `Script truncated from ${wordCount} to 20 words for 8-second delivery.`
  };
}

export function compileVeoPrompt(input: {
  category: CampaignCategory;
  mission?: string;
  script?: string;
  subject?: string;
  identityLock?: boolean;
  avatarName?: string;
  visualTemplate?: string;
  language?: LanguageMode;
}) {
  const template = campaignTemplates[input.category];
  const calibrated = calibrateScript(mandatoryPhoneVideoScript());
  const dialogue = calibrated.script
    ? `Dialogue, spoken exactly and naturally in 8 seconds: ${JSON.stringify(calibrated.script)}.`
    : "If speech is useful, keep it brief (15-20 words max), conversational, legally cautious, and non-promissory.";

  const identity = input.identityLock
    ? `IDENTITY LOCK: the supplied reference portrait is the only allowed on-camera person. Preserve that exact adult identity, face, skin tone, hair, age, and wardrobe${input.avatarName ? ` (${input.avatarName})` : ""}. Do not invent or swap to a different person.`
    : "";

  const language = getLanguageInstruction(input.language || "english");
  const visualStyle = getTemplateHint(input.visualTemplate);

  const prompt = [
    "ONE CONTINUOUS SHOT ONLY. No cuts, no montage, no scene changes, no time jump. Duration is exactly 8 seconds.",
    "Vertical social-ad realism unless request settings specify landscape. Photorealistic real-world smartphone footage, not CGI and not glossy TV-commercial imagery.",
    "CRITICAL: Any spoken dialogue MUST be 15-20 words maximum for natural 8-second delivery at normal speaking pace (130-150 WPM). Do not rush speech.",
    mandatoryVideoContactDirective(),
    language,
    template.instruction,
    visualStyle,
    identity,
    input.subject?.trim() ? `Subject/reference objective: ${input.subject.trim()}.` : "",
    input.mission?.trim() ? `Campaign mission: ${input.mission.trim()}.` : "",
    "Adults only when people appear. Natural skin pores, fine facial texture, anatomically correct eyes and gaze, stable teeth, five fingers per hand, realistic hair and fabric physics, natural breathing and microexpressions.",
    "Physically coherent lighting, shadows, reflections, glare, motion blur, inertia, gravity, vehicle or floor contact, and environmental scale. Stable identity and object geometry for the full shot.",
    "Camera: plausible modern smartphone, subtle handheld motion, minor autofocus correction, natural HDR exposure, realistic lens behavior, shallow depth-of-field when appropriate.",
    "Audio: natural room tone, ambient sound, or clear voice-over. No music unless explicitly requested.",
    "Legal guardrail: do not show guaranteed outcomes, invented settlements, fake testimonials, unsupported medical claims, or synthetic footage presented as real evidence.",
    dialogue,
  ].filter(Boolean).join(" ");

  return prompt.length > MAX_CHARS ? prompt.slice(0, MAX_CHARS) + "…" : prompt;
}
