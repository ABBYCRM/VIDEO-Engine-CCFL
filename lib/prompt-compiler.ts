import { campaignTemplates, type CampaignCategory } from "@/lib/prompts";

const MAX_CHARS = 3400; // Conservative cap under Veo's 1,024-token prompt limit.

export function compileVeoPrompt(input: {
  category: CampaignCategory;
  mission?: string;
  script?: string;
  subject?: string;
  identityLock?: boolean;
  avatarName?: string;
}) {
  const template = campaignTemplates[input.category];
  const dialogue = input.script?.trim()
    ? `Dialogue, spoken exactly and naturally: ${JSON.stringify(input.script.trim())}.`
    : "If speech is useful, keep it brief, conversational, legally cautious, and non-promissory.";
  const identity = input.identityLock
    ? `IDENTITY LOCK: the supplied reference portrait is the only allowed on-camera person. Preserve that exact adult identity, face, skin tone, hair, age, and wardrobe${input.avatarName ? ` (${input.avatarName})` : ""}. Do not invent or swap to a different person.`
    : "";
  const prompt = [
    "ONE CONTINUOUS SHOT ONLY. No cuts, no montage, no scene changes, no time jump. Duration is exactly 8 seconds.",
    "Vertical social-ad realism unless request settings specify landscape. Photorealistic real-world smartphone footage, not CGI and not glossy TV-commercial imagery.",
    template.instruction,
    identity,
    input.subject?.trim() ? `Subject/reference objective: ${input.subject.trim()}.` : "",
    input.mission?.trim() ? `Campaign mission: ${input.mission.trim()}.` : "",
    "Adults only when people appear. Natural skin pores, fine facial texture, anatomically correct eyes and gaze, stable teeth, five fingers per hand, realistic hair and fabric physics, natural breathing and microexpressions.",
    "Physically coherent lighting, shadows, reflections, glare, motion blur, inertia, gravity, vehicle or floor contact, and environmental scale. Stable identity and object geometry for the full shot.",
    "Camera: plausible modern smartphone, subtle handheld motion, minor autofocus correction, natural HDR exposure, realistic lens behavior. Avoid robotic camera motion and fake shallow depth of field.",
    dialogue,
    "Audio: synchronized dialogue when present plus physically appropriate ambience and restrained sound effects. No sterile silence unless requested.",
    "Legal-ad constraints: no guaranteed recovery, invented settlement, fabricated testimonial, fake client, unsupported medical diagnosis, fake police/news evidence, or claim that generated footage is a real documented incident. No gore.",
    "Avoid AI artifacts: face drift, plastic skin, dead eyes, extra fingers, warped limbs, melting teeth, changing vehicles or damage, duplicate objects, geometry drift, flicker, impossible reflections, random lens flare, over-sharpening, or video-game appearance."
  ].filter(Boolean).join(" ");
  if (prompt.length <= MAX_CHARS) return prompt;
  const fixed = prompt.replace(input.mission?.trim() || "", "").replace(input.subject?.trim() || "", "");
  const budget = Math.max(0, MAX_CHARS - fixed.length - 120);
  const mission = `${input.subject || ""} ${input.mission || ""}`.trim().slice(0, budget);
  return `${fixed} User objective, compacted: ${mission}`.slice(0, MAX_CHARS);
}
