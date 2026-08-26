// Unified create flow template gallery — mirrors the 13 split-screen
// templates in lib/split-templates.ts so every surface shows the same
// brand system. "auto" lets the AI choose per brief.
export const visualTemplates = [
  {
    id: "auto",
    label: "Auto",
    description: "AI chooses the best template for your content",
    image: null,
    aspectRatio: "9:16" as const,
    isAuto: true
  },
  {
    id: "office-modern",
    label: "Crash CTA · dusk highway",
    description: "Use for the main car-accident call-to-action reel.",
    image: "/backgrounds/split-template-office-modern.png",
    aspectRatio: "9:16" as const,
    promptHint: "Vertical Florida highway dusk scene, calm, with the upper third kept visually quiet. Professional spokesperson with a calm, reassuring delivery."
  },
  {
    id: "office-warm",
    label: "Clients Say · bright office",
    description: "Use for testimonial and social-proof reels with documented quotes.",
    image: "/backgrounds/split-template-office-warm.png",
    aspectRatio: "9:16" as const,
    promptHint: "Light, airy, bright office background with uncluttered framing. Warm, friendly spokesperson."
  },
  {
    id: "digital-grid",
    label: "The Full Story · dual frame",
    description: "Use for two-angle storytelling that pairs the situation with guidance.",
    image: "/backgrounds/split-template-digital-grid.png",
    aspectRatio: "9:16" as const,
    promptHint: "Documentary scene of the incident context, with no faces. Spokesperson explaining the next steps."
  },
  {
    id: "rideshare-night",
    label: "Rideshare · night city",
    description: "Use for Uber, Lyft, and delivery accident reels.",
    image: "/backgrounds/split-template-rideshare-night.png",
    aspectRatio: "9:16" as const,
    promptHint: "Rainy neon night city background. Keep the spokesperson centered in the avatar frame."
  },
  {
    id: "truck-highway",
    label: "Truck crash · highway",
    description: "Use for commercial-vehicle crash reels.",
    image: "/backgrounds/split-template-truck-highway.png",
    aspectRatio: "9:16" as const,
    promptHint: "Highway scene with a semi truck; keep the right side visually quiet for the avatar. Position the spokesperson on the right side."
  },
  {
    id: "slipfall-store",
    label: "Slip & fall · retail",
    description: "Use for premises-liability reels.",
    image: "/backgrounds/split-template-slipfall-store.png",
    aspectRatio: "9:16" as const,
    promptHint: "Bright retail store interior with a clean documentary feel. Position the spokesperson on the left."
  },
  {
    id: "motorcycle-sunset",
    label: "Motorcycle · sunset",
    description: "Use for motorcycle crash reels.",
    image: "/backgrounds/split-template-motorcycle-sunset.png",
    aspectRatio: "9:16" as const,
    promptHint: "Coastal road at sunset with a calm, cinematic atmosphere. Keep the spokesperson centered in the avatar frame."
  },
  {
    id: "evidence-phone",
    label: "Evidence checklist",
    description: "Use for educational what-to-do-at-the-scene reels.",
    image: "/backgrounds/split-template-evidence-phone.png",
    aspectRatio: "9:16" as const,
    promptHint: "Documentary phone and dashcam evidence mood, realistic and uncluttered. Keep the spokesperson centered in the avatar frame."
  },
  {
    id: "spanish-golden",
    label: "Español · golden hour",
    description: "Use for Spanish-language outreach reels with the script and captions in Spanish.",
    image: "/backgrounds/split-template-spanish-golden.png",
    aspectRatio: "9:16" as const,
    promptHint: "Warm golden-hour boulevard. The spokesperson speaks Spanish with a natural, reassuring delivery."
  },
  {
    id: "deadline-hourglass",
    label: "Urgency · evidence fades",
    description: "Use for urgency reels about acting fast.",
    image: "/backgrounds/split-template-deadline-hourglass.png",
    aspectRatio: "9:16" as const,
    promptHint: "Dramatic time and hourglass mood that conveys urgency without sensationalism. Keep the spokesperson centered and composed."
  },
  {
    id: "myths-chess",
    label: "Myths · debunked",
    description: "Use for myth-busting educational reels.",
    image: "/backgrounds/split-template-myths-chess.png",
    aspectRatio: "9:16" as const,
    promptHint: "Strategic chess mood with restrained, professional visuals. Keep the spokesperson centered in the avatar frame."
  },
  {
    id: "qa-studio",
    label: "Q&A · studio",
    description: "Use for a question-and-answer format where the upper lane shows the question or situation and the lower lane gives the answer.",
    image: "/backgrounds/split-template-qa-studio.png",
    aspectRatio: "9:16" as const,
    promptHint: "Show the concise question or its situation in a clean studio-style scene. Show the spokesperson directly answering the upper-lane question."
  },
  {
    id: "daynight-street",
    label: "Scene vs next day",
    description: "Use for before-and-after storytelling where the upper lane shows the incident scene and the lower lane gives aftermath guidance.",
    image: "/backgrounds/split-template-daynight-street.png",
    aspectRatio: "9:16" as const,
    promptHint: "Show the incident street scene as the before moment. Show calm next-day aftermath guidance from a spokesperson."
  }
] as const;

export type VisualTemplateId = typeof visualTemplates[number]["id"];
