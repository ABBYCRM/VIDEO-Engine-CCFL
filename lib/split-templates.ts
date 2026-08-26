// Split-screen templates. Each is a fixed, permanent background asset that
// both the server-side ffmpeg compose (lib/split-compose.ts) and the
// browser canvas render (app/podcast-interview/page.tsx) composite the
// upper and lower lane videos into. Coordinates were measured directly
// from each template PNG at its native canvas size — if a template asset
// is regenerated at different geometry, these must be updated to match.
//
// Two layouts exist:
//  - "avatar-box": the upper lane video cover-crops the WHOLE canvas as a
//    permanent backdrop; the lower/avatar lane composites only inside a
//    single framed box (a picture-in-frame look).
//  - "dual-box": both lanes composite into their own separate framed
//    boxes over a static template background/artwork (no lane fills the
//    whole canvas).

export type SplitTemplateId = "office-modern" | "office-warm" | "digital-grid" | "rideshare-night" | "truck-highway" | "slipfall-store" | "motorcycle-sunset" | "evidence-phone" | "spanish-golden" | "deadline-hourglass" | "myths-chess" | "qa-studio" | "daynight-street";

export type SplitBox = { x: number; y: number; w: number; h: number };
export type VideoPromptHints = { background?: string; avatar?: string; upper?: string; lower?: string };

export type AvatarBoxTemplateDef = {
  id: string;
  layout: "avatar-box";
  label: string;
  purpose: string;
  videoPromptHints: VideoPromptHints;
  assetPath: string;
  canvasW: number;
  canvasH: number;
  avatarBox: SplitBox;
};

export type DualBoxTemplateDef = {
  id: string;
  layout: "dual-box";
  label: string;
  purpose: string;
  videoPromptHints: VideoPromptHints;
  assetPath: string;
  canvasW: number;
  canvasH: number;
  upperBox: SplitBox;
  lowerBox: SplitBox;
};

export type SplitTemplateDef = AvatarBoxTemplateDef | DualBoxTemplateDef;

export const SPLIT_TEMPLATES: SplitTemplateDef[] = [
  {
    id: "office-modern",
    layout: "avatar-box",
    label: "Crash CTA · dusk highway",
    purpose: "Use for the main car-accident call-to-action reel.",
    videoPromptHints: {
      background: "Vertical Florida highway dusk scene, calm, with the upper third kept visually quiet.",
      avatar: "Professional spokesperson with a calm, reassuring delivery."
    },
    assetPath: "/backgrounds/split-template-office-modern.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 337, y: 529, w: 320, h: 477 }
  },
  {
    id: "office-warm",
    layout: "avatar-box",
    label: "Clients Say · bright office",
    purpose: "Use for testimonial and social-proof reels with documented quotes.",
    videoPromptHints: {
      background: "Light, airy, bright office background with uncluttered framing.",
      avatar: "Warm, friendly spokesperson."
    },
    assetPath: "/backgrounds/split-template-office-warm.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 234, y: 591, w: 256, h: 478 }
  },
  {
    id: "digital-grid",
    layout: "dual-box",
    label: "The Full Story · dual frame",
    purpose: "Use for two-angle storytelling that pairs the situation with guidance.",
    videoPromptHints: {
      upper: "Documentary scene of the incident context, with no faces.",
      lower: "Spokesperson explaining the next steps."
    },
    assetPath: "/backgrounds/split-template-digital-grid.png",
    canvasW: 1024,
    canvasH: 1536,
    upperBox: { x: 76, y: 245, w: 869, h: 405 },
    lowerBox: { x: 70, y: 737, w: 882, h: 513 }
  },
  {
    id: "rideshare-night",
    layout: "avatar-box",
    label: "Rideshare · night city",
    purpose: "Use for Uber, Lyft, and delivery accident reels.",
    videoPromptHints: { background: "Rainy neon night city background.", avatar: "Keep the spokesperson centered in the avatar frame." },
    assetPath: "/backgrounds/split-template-rideshare-night.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 560, w: 320, h: 480 }
  },
  {
    id: "truck-highway",
    layout: "avatar-box",
    label: "Truck crash · highway",
    purpose: "Use for commercial-vehicle crash reels.",
    videoPromptHints: { background: "Highway scene with a semi truck; keep the right side visually quiet for the avatar.", avatar: "Position the spokesperson on the right side." },
    assetPath: "/backgrounds/split-template-truck-highway.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 360, y: 520, w: 320, h: 490 }
  },
  {
    id: "slipfall-store",
    layout: "avatar-box",
    label: "Slip & fall · retail",
    purpose: "Use for premises-liability reels.",
    videoPromptHints: { background: "Bright retail store interior with a clean documentary feel.", avatar: "Position the spokesperson on the left." },
    assetPath: "/backgrounds/split-template-slipfall-store.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 40, y: 540, w: 320, h: 480 }
  },
  {
    id: "motorcycle-sunset",
    layout: "avatar-box",
    label: "Motorcycle · sunset",
    purpose: "Use for motorcycle crash reels.",
    videoPromptHints: { background: "Coastal road at sunset with a calm, cinematic atmosphere.", avatar: "Keep the spokesperson centered in the avatar frame." },
    assetPath: "/backgrounds/split-template-motorcycle-sunset.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 530, w: 320, h: 490 }
  },
  {
    id: "evidence-phone",
    layout: "avatar-box",
    label: "Evidence checklist",
    purpose: "Use for educational what-to-do-at-the-scene reels.",
    videoPromptHints: { background: "Documentary phone and dashcam evidence mood, realistic and uncluttered.", avatar: "Keep the spokesperson centered in the avatar frame." },
    assetPath: "/backgrounds/split-template-evidence-phone.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 580, w: 320, h: 460 }
  },
  {
    id: "spanish-golden",
    layout: "avatar-box",
    label: "Español · golden hour",
    purpose: "Use for Spanish-language outreach reels with the script and captions in Spanish.",
    videoPromptHints: { background: "Warm golden-hour boulevard.", avatar: "The spokesperson speaks Spanish with a natural, reassuring delivery." },
    assetPath: "/backgrounds/split-template-spanish-golden.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 550, w: 320, h: 480 }
  },
  {
    id: "deadline-hourglass",
    layout: "avatar-box",
    label: "Urgency · evidence fades",
    purpose: "Use for urgency reels about acting fast.",
    videoPromptHints: { background: "Dramatic time and hourglass mood that conveys urgency without sensationalism.", avatar: "Keep the spokesperson centered and composed." },
    assetPath: "/backgrounds/split-template-deadline-hourglass.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 540, w: 320, h: 480 }
  },
  {
    id: "myths-chess",
    layout: "avatar-box",
    label: "Myths · debunked",
    purpose: "Use for myth-busting educational reels.",
    videoPromptHints: { background: "Strategic chess mood with restrained, professional visuals.", avatar: "Keep the spokesperson centered in the avatar frame." },
    assetPath: "/backgrounds/split-template-myths-chess.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 200, y: 560, w: 320, h: 470 }
  },
  {
    id: "qa-studio",
    layout: "dual-box",
    label: "Q&A · studio",
    purpose: "Use for a question-and-answer format where the upper lane shows the question or situation and the lower lane gives the answer.",
    videoPromptHints: { upper: "Show the concise question or its situation in a clean studio-style scene.", lower: "Show the spokesperson directly answering the upper-lane question." },
    assetPath: "/backgrounds/split-template-qa-studio.png",
    canvasW: 1024,
    canvasH: 1536,
    upperBox: { x: 76, y: 250, w: 869, h: 400 },
    lowerBox: { x: 76, y: 740, w: 869, h: 500 }
  },
  {
    id: "daynight-street",
    layout: "dual-box",
    label: "Scene vs next day",
    purpose: "Use for before-and-after storytelling where the upper lane shows the incident scene and the lower lane gives aftermath guidance.",
    videoPromptHints: { upper: "Show the incident street scene as the before moment.", lower: "Show calm next-day aftermath guidance from a spokesperson." },
    assetPath: "/backgrounds/split-template-daynight-street.png",
    canvasW: 1024,
    canvasH: 1536,
    upperBox: { x: 76, y: 245, w: 869, h: 405 },
    lowerBox: { x: 70, y: 737, w: 882, h: 513 }
  }
];

export const DEFAULT_SPLIT_TEMPLATE_ID: SplitTemplateId = "office-modern";

export function isSplitTemplateId(value: unknown): value is SplitTemplateId {
  return typeof value === "string" && SPLIT_TEMPLATES.some((t) => t.id === value);
}

export function getSplitTemplate(id?: string | null): SplitTemplateDef {
  return SPLIT_TEMPLATES.find((t) => t.id === id) || SPLIT_TEMPLATES[0];
}
