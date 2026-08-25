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

export type SplitTemplateId = "office-modern" | "office-warm" | "digital-grid";

export type SplitBox = { x: number; y: number; w: number; h: number };

export type AvatarBoxTemplateDef = {
  id: SplitTemplateId;
  layout: "avatar-box";
  label: string;
  assetPath: string;
  canvasW: number;
  canvasH: number;
  avatarBox: SplitBox;
};

export type DualBoxTemplateDef = {
  id: SplitTemplateId;
  layout: "dual-box";
  label: string;
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
    label: "Modern office · blue glass",
    assetPath: "/backgrounds/split-template-office-modern.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 337, y: 529, w: 320, h: 477 }
  },
  {
    id: "office-warm",
    layout: "avatar-box",
    label: "Warm office · bookshelf & skyline",
    assetPath: "/backgrounds/split-template-office-warm.png",
    canvasW: 720,
    canvasH: 1280,
    avatarBox: { x: 234, y: 591, w: 256, h: 478 }
  },
  {
    id: "digital-grid",
    layout: "dual-box",
    label: "Digital grid · dual frame",
    assetPath: "/backgrounds/split-template-digital-grid.png",
    canvasW: 1024,
    canvasH: 1536,
    upperBox: { x: 76, y: 245, w: 869, h: 405 },
    lowerBox: { x: 70, y: 737, w: 882, h: 513 }
  }
];

export const DEFAULT_SPLIT_TEMPLATE_ID: SplitTemplateId = SPLIT_TEMPLATES[0].id;

export function isSplitTemplateId(value: unknown): value is SplitTemplateId {
  return typeof value === "string" && SPLIT_TEMPLATES.some((t) => t.id === value);
}

export function getSplitTemplate(id?: string | null): SplitTemplateDef {
  return SPLIT_TEMPLATES.find((t) => t.id === id) || SPLIT_TEMPLATES[0];
}
