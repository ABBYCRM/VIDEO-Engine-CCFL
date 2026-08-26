export type StillPostTemplateDef = {
  id: string;
  label: string;
  assetPath: string;
  canvasW: 1080;
  canvasH: 1350;
  purpose: string;
  imagePromptHints: string;
};

export const STILL_POST_TEMPLATES: StillPostTemplateDef[] = [
  {
    id: "post-stat-ledger",
    label: "Stat ledger · torn panel",
    assetPath: "/backgrounds/still-template-post-stat-ledger.png",
    canvasW: 1080,
    canvasH: 1350,
    purpose: "Feed post: bold FREE/FAST/ZERO value props over a photo right of the torn navy panel",
    imagePromptHints: "vertical 4:5 photo, key subject in the RIGHT 55% of frame, left side dark/simple (covered by navy panel), Florida roadside or office scene, cinematic, no text, no logos"
  },
  {
    id: "post-billboard",
    label: "Billboard · full bleed",
    assetPath: "/backgrounds/still-template-post-billboard.png",
    canvasW: 1080,
    canvasH: 1350,
    purpose: "Feed post: HURT IN A CRASH? START HERE over a full-bleed photo",
    imagePromptHints: "vertical 4:5 full-bleed photo, keep TOP third calm and low-detail (sky/wall) for headline, subject center/lower, dusk Florida mood, no text, no logos"
  },
  {
    id: "post-clients-say",
    label: "Clients Say · quote card",
    assetPath: "/backgrounds/still-template-post-clients-say.png",
    canvasW: 1080,
    canvasH: 1350,
    purpose: "Feed post: testimonial quote card; photo shows through left window and background",
    imagePromptHints: "vertical 4:5 photo, key subject in LEFT third inside a tall window area, right side simple (covered by white card), warm hopeful daylight, no text, no logos"
  }
];

export function getStillPostTemplate(id?: string | null): StillPostTemplateDef {
  return STILL_POST_TEMPLATES.find(template => template.id === id) || STILL_POST_TEMPLATES[0];
}

export function pickRandomStillPostTemplate(): StillPostTemplateDef {
  return STILL_POST_TEMPLATES[Math.floor(Math.random() * STILL_POST_TEMPLATES.length)];
}