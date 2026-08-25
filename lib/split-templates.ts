// Split-screen picture-in-frame templates. Each is a fixed, permanent
// background asset (branded office backdrop + gold frame, with a
// transparent cutout for the avatar's video) that both the server-side
// ffmpeg compose (lib/split-compose.ts) and the browser canvas render
// (app/podcast-interview/page.tsx) composite the upper AI video and the
// avatar's video into. Coordinates were measured directly from each
// template PNG at its native 720x1280 canvas size — if a template asset
// is regenerated at different geometry, these must be updated to match.

export type SplitTemplateId = "office-modern" | "office-warm";

export type SplitTemplateDef = {
  id: SplitTemplateId;
  label: string;
  assetPath: string;
  canvasW: number;
  canvasH: number;
  avatarBox: { x: number; y: number; w: number; h: number };
};

export const SPLIT_TEMPLATES: SplitTemplateDef[] = [
  {
    id: "office-modern",
    label: "Modern office · blue glass",
    assetPath: "/backgrounds/split-template-office-modern.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 337, y: 529, w: 320, h: 477 }
  },
  {
    id: "office-warm",
    label: "Warm office · bookshelf & skyline",
    assetPath: "/backgrounds/split-template-office-warm.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 234, y: 591, w: 256, h: 478 }
  }
];

export const DEFAULT_SPLIT_TEMPLATE_ID: SplitTemplateId = SPLIT_TEMPLATES[0].id;

export function isSplitTemplateId(value: unknown): value is SplitTemplateId {
  return typeof value === "string" && SPLIT_TEMPLATES.some((t) => t.id === value);
}

export function getSplitTemplate(id?: string | null): SplitTemplateDef {
  return SPLIT_TEMPLATES.find((t) => t.id === id) || SPLIT_TEMPLATES[0];
}
