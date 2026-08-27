// Cartoon still composer — overlays the CaseClosedFL footer + navy left panel on the
// AI-generated Pixar-style cartoon scene.
//
// Layout (1080x1350):
//   ┌──────────────────────────────────────────────┐  0
//   │   AI-generated cartoon scene (top ~85%)       │
//   │                                              │
//   ├──────────────┬───────────────────────────────┤  ~1147
//   │ NAVY PANEL   │  Solid orange #FF6D00 footer   │  ~1237
//   │ (text/lines) │  CaseClosedFL.com | (561) ...  │
//   ├──────────────┴───────────────────────────────┤
//   │   fine print: Not a law firm · ...           │  1350
//   └──────────────────────────────────────────────┘
//
// The composer's job is to take the AI-generated PNG (which is 1080x1350 but only
// the top ~85% has the cartoon scene — the bottom ~15% is supposed to be a clean
// solid-color zone per the prompt) and overlay the navy panel on the left and the
// orange footer bar across the bottom.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCartoonImagePrompt,
  buildCartoonOverlaySpec,
  getCartoonTemplate,
  pickCartoonTemplateForCategory,
  pickCartoonVariant,
  type CartoonTemplateDef,
  type CartoonVariant,
} from "@/lib/cartoon-still-templates";
import type { CartoonOverlaySpec } from "@/lib/cartoon-still-templates";
export type { CartoonOverlaySpec } from "@/lib/cartoon-still-templates";

function run(cmd: string, args: string[], timeoutMs = 120_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    child.stderr.on("data", chunk => {
      err = `${err}${String(chunk)}`.slice(-12_000);
    });
    child.on("error", error => finish(new Error(`${cmd} is not available: ${error.message}`)));
    child.on("close", code => {
      if (code === 0) finish();
      else finish(new Error((err || `${cmd} exited ${code}`).slice(-1800)));
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);
    timer.unref?.();
  });
}

async function resolveFontPath(): Promise<string | null> {
  const candidates = [
    process.env.FONT_PATH,
    path.resolve(process.cwd(), "public", "fonts", "DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return null;
}

function escDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\u2019")
    .replace(/\n/g, "\\N"); // ffmpeg \N is a newline
}

// Canvas geometry
const W = 1080;
const H = 1350;
const FOOTER_BAR_H = 96; // orange bar height
const FINE_PRINT_H = 26; // fine-print row height
const NAVY_PANEL_X = 0;
const NAVY_PANEL_W = 540; // left half is the navy panel that holds the text
const NAVY_PANEL_Y = 0;
const NAVY_PANEL_H = H - FOOTER_BAR_H - FINE_PRINT_H;
const ORANGE_HEX = "0xFF6D00";
const NAVY_HEX = "0x0F1B2D";
const WHITE = "0xFFFFFF";
const SUB_ORANGE = "0xFF8A3D";

/**
 * Compose the cartoon still by overlaying the navy panel + orange footer on top of
 * the AI-generated cartoon image.
 *
 * Inputs:
 *   - photoPath: the path to the AI-generated cartoon PNG (1080x1350, 9:16 is also OK)
 *   - overlay: the text spec (headline/subhead/cta/footer/fine print)
 *   - outPath: where to write the final composed PNG
 */
export async function composeCartoonStillPost(input: {
  photoPath: string;
  overlay: CartoonOverlaySpec;
  outPath: string;
}): Promise<void> {
  await fs.mkdir(path.dirname(input.outPath), { recursive: true });
  const font = (await resolveFontPath()) || "";

  // 1) Scale the cartoon to fit 1080x1350
  // 2) Draw the navy panel on the left half (top to footer)
  // 3) Draw the orange footer bar across the bottom
  // 4) Draw the fine print below
  // 5) Draw the headline / subhead / cta / small text on the navy panel
  const filterParts: string[] = [
    // First scale and crop the cartoon to fill 1080x1350
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg]`,
    // Navy left panel (top to footer)
    `[bg]drawbox=x=${NAVY_PANEL_X}:y=${NAVY_PANEL_Y}:w=${NAVY_PANEL_W}:h=${NAVY_PANEL_H}:color=${NAVY_HEX}:t=fill[p1]`,
    // Small CASE CLOSED FL brand mark in top-left of navy panel
    // Orange diagonal accent strip along the right edge of the navy panel (a torn-paper feel)
    `[p1]drawbox=x=${NAVY_PANEL_W - 4}:y=0:w=4:h=${NAVY_PANEL_H}:color=${ORANGE_HEX}:t=fill[p2]`,
    // Orange footer bar across the bottom
    `[p2]drawbox=x=0:y=${NAVY_PANEL_H}:w=${W}:h=${FOOTER_BAR_H}:color=${ORANGE_HEX}:t=fill[p3]`,
  ];

  if (font) {
    // CASE CLOSED FL brand mark (small, top of navy panel)
    filterParts.push(
      // Eyebrow / brand
      `[p3]drawtext=fontfile='${font}':text='${escDrawtext("CASE CLOSED FL")}':fontcolor=${WHITE}:fontsize=30:x=48:y=44:font=bold[p4]`,
    );

    // Headline (large, white, multi-line)
    const headlineLines = input.overlay.headline.split("\n");
    headlineLines.forEach((line, i) => {
      const y = 130 + i * 96;
      filterParts.push(`[p${4 + i}]drawtext=fontfile='${font}':text='${escDrawtext(line)}':fontcolor=${WHITE}:fontsize=92:x=48:y=${y}:font=bold[p${5 + i}]`);
    });

    // Subhead (orange, smaller)
    const subheadLines = input.overlay.subhead.split("\n");
    subheadLines.forEach((line, i) => {
      const y = 130 + headlineLines.length * 96 + 30 + i * 60;
      const lastIdx = 4 + headlineLines.length + i;
      filterParts.push(`[p${lastIdx - 1}]drawtext=fontfile='${font}':text='${escDrawtext(line)}':fontcolor=${SUB_ORANGE}:fontsize=52:x=48:y=${y}:font=bold[p${lastIdx}]`);
    });

    // CTA (white, same size as headline)
    const ctaLines = input.overlay.cta.split("\n");
    ctaLines.forEach((line, i) => {
      const y = 130 + headlineLines.length * 96 + 30 + subheadLines.length * 60 + 60 + i * 96;
      const lastIdx = 4 + headlineLines.length + subheadLines.length + i;
      filterParts.push(`[p${lastIdx - 1}]drawtext=fontfile='${font}':text='${escDrawtext(line)}':fontcolor=${WHITE}:fontsize=92:x=48:y=${y}:font=bold[p${lastIdx}]`);
    });

    // Small print (gray, near bottom of navy)
    const smallLines = input.overlay.small.split("\n");
    const smallBaseY = NAVY_PANEL_H - 90;
    smallLines.forEach((line, i) => {
      const y = smallBaseY + i * 28;
      const lastIdx = 4 + headlineLines.length + subheadLines.length + ctaLines.length + i;
      filterParts.push(`[p${lastIdx - 1}]drawtext=fontfile='${font}':text='${escDrawtext(line)}':fontcolor=0xC9D2E0:fontsize=22:x=48:y=${y}[p${lastIdx + 1}]`);
    });

    // Footer text — left and right on the orange bar
    const footerY = NAVY_PANEL_H + 32;
    const lastIdx = 4 + headlineLines.length + subheadLines.length + ctaLines.length + smallLines.length;
    filterParts.push(
      `[p${lastIdx}]drawtext=fontfile='${font}':text='${escDrawtext(input.overlay.footerLeft)}':fontcolor=0x101B33:fontsize=32:x=48:y=${footerY}:font=bold[p${lastIdx + 1}]`,
      `[p${lastIdx + 1}]drawtext=fontfile='${font}':text='${escDrawtext(input.overlay.footerRight)}':fontcolor=0x101B33:fontsize=32:x=${W - 240}:y=${footerY}:font=bold[p${lastIdx + 2}]`,
    );

    // Fine print (centered, below the orange bar)
    const fineY = NAVY_PANEL_H + FOOTER_BAR_H + 4;
    filterParts.push(
      `[p${lastIdx + 2}]drawtext=fontfile='${font}':text='${escDrawtext(input.overlay.finePrint)}':fontcolor=0x101B33:fontsize=16:x=${W / 2}:y=${fineY}:font=bold:text_align=center[v]`,
    );
  } else {
    // No font — leave a labelled empty panel so the operator can see the issue
    filterParts.push(`[p3]drawbox=x=0:y=600:w=${W}:h=2:color=0xFF6D00:t=fill[v]`);
  }

  const filter = filterParts.join(";");

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  await run(ffmpeg, [
    "-y",
    "-i",
    input.photoPath,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-frames:v",
    "1",
    input.outPath,
  ]);
}

// ── Public convenience: build the prompt + overlay spec in one call ──

export function planCartoonStill(input: {
  category: string;
  seed?: string | null;
  templateId?: string | null;
}): {
  template: CartoonTemplateDef;
  variant: CartoonVariant;
  variantIndex: number;
  imagePrompt: string;
  overlay: CartoonOverlaySpec;
} {
  const template =
    getCartoonTemplate(input.templateId) ||
    pickCartoonTemplateForCategory(input.category, input.seed);
  const idx = Math.abs(hashStr(`${template.id}:${input.seed || "default"}`)) % template.variants.length;
  const variant = template.variants[idx] || {
    scene: "",
    headline: template.defaultHeadline,
    subhead: template.defaultSubhead,
    cta: template.defaultCta,
  };
  return {
    template,
    variant,
    variantIndex: idx,
    imagePrompt: buildCartoonImagePrompt(template, variant),
    overlay: buildCartoonOverlaySpec(template, variant, idx),
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}
