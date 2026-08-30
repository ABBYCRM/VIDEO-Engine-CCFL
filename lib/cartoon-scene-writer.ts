// AI-authored fresh cartoon scenes — closes the "images repeat" gap.
//
// lib/cartoon-still-templates.ts's hand-authored `variants` arrays are only
// 2-3 entries per template. pickCartoonVariant() picks deterministically by
// hashing a seed modulo that pool size, so under perpetual daily autonomous
// operation (lib/reddit-research/pipeline.ts, lib/site-autopilot/pipeline.ts)
// the same handful of scenes WILL eventually repeat verbatim — those
// hand-authored variants were meant as style references for the operator's
// locked visual identity, never as a finite content pool to cycle forever.
//
// This module asks NVIDIA to author a brand-new scenario each run — never
// the locked CHARACTERS/STYLE_BLOCK text itself (assembleCartoonScene()
// wraps whatever it writes in the exact same locked wrapping every
// hand-authored variant already uses, so the visual identity can't drift)
// — grounded by the template's own examples as style references and an
// explicit "already used, do not repeat or closely resemble" list pulled
// from recent run history across BOTH autonomous pipelines. On any failure
// (NVIDIA disabled, bad JSON, upstream error) callers fall back to the
// existing fixed-pool pick — this only ever adds variety, never blocks a run.

import { chatCompletion, isNvidiaEnabled } from "@/lib/nvidia/client";
import { assembleCartoonScene, summarizeCartoonScene, type CartoonTemplateDef, type CartoonVariant } from "@/lib/cartoon-still-templates";
import { recentSceneSummaries as recentRedditSceneSummaries } from "@/lib/reddit-research/store";
import { recentSceneSummaries as recentSiteSceneSummaries } from "@/lib/site-autopilot/store";

export { summarizeCartoonScene };

const MAX_RECENT_SCENES = 12;

/** Merges recent scene summaries from BOTH autonomous pipelines (most
 *  recent first) so neither one ever repeats a scenario the other already
 *  posted, not just its own history. */
export function getRecentCartoonSceneSummaries(limit = MAX_RECENT_SCENES): string[] {
  const combined = [...recentRedditSceneSummaries(limit), ...recentSiteSceneSummaries(limit)];
  combined.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return combined.slice(0, limit).map((r) => r.sceneSummary);
}

export async function generateFreshCartoonScene(
  template: CartoonTemplateDef,
  recentScenes: string[]
): Promise<CartoonVariant | null> {
  if (!isNvidiaEnabled()) return null;

  const exampleBlock = template.variants
    .map((v, i) => `Example ${i + 1} scenario (style/character/tone reference ONLY — never reuse this specific scenario, prop, or wording): ${summarizeCartoonScene(v)}`)
    .join("\n\n");
  const avoidBlock = recentScenes.length > 0
    ? recentScenes.slice(0, MAX_RECENT_SCENES).map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(none yet — this is the first run)";

  const system = `You write short visual scenario briefs for a Florida personal-injury law firm's recurring cartoon ad campaign ("${template.label}", category: ${template.category}). The campaign has a LOCKED visual style and two recurring characters (an injured worker and a reassuring legal professional) that you must never redescribe — you only invent the SPECIFIC accident scenario: the setting, the specific incident, and any storytelling prop. Requirements:
- Stay strictly within the "${template.category}" category (same general kind of accident as the examples below).
- Invent a genuinely NEW scenario: a different location, different specific incident detail, and/or a different mood or prop than every scenario in the "ALREADY USED" list — do not repeat, closely paraphrase, or trivially reword any of them.
- No fabricated legal results, settlement amounts, diagnoses, testimonials, graphic/gory injury detail, or statistics.
- Keep it G-rated and brand-safe: an injury is implied via a cast, bandage, or wince, never depicted graphically.
- Write only the scenario paragraph itself (no character descriptions, no style/lighting direction — those are added separately), 2-4 sentences.
- Also write a short ad headline (max 2 short lines, \\n separated), a subhead (max 2 short lines), and a CTA line (max 2 short lines), matching the punchy, reassuring tone of the campaign's existing copy (e.g. "Free consult. No fees until you win.").
Respond with strict JSON only: {"sceneDescription": "...", "headline": "...", "subhead": "...", "cta": "..."}`;

  const user = `EXAMPLE SCENARIOS FOR THIS TEMPLATE (style reference only):\n${exampleBlock}\n\nALREADY USED SCENARIOS (do not repeat or closely resemble any of these):\n${avoidBlock}\n\nWrite one new scenario now.`;

  try {
    const res = await chatCompletion({
      model: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      jsonMode: true,
      temperature: 0.9,
      maxTokens: 500
    });
    const parsed = JSON.parse(res.text) as Partial<Record<"sceneDescription" | "headline" | "subhead" | "cta", string>>;
    const sceneDescription = String(parsed.sceneDescription || "").trim();
    const headline = String(parsed.headline || "").trim();
    const subhead = String(parsed.subhead || "").trim();
    const cta = String(parsed.cta || "").trim();
    if (!sceneDescription || !headline || !subhead || !cta) return null;
    return {
      scene: assembleCartoonScene(sceneDescription),
      headline: headline.slice(0, 200),
      subhead: subhead.slice(0, 200),
      cta: cta.slice(0, 200)
    };
  } catch (e) {
    console.warn("[cartoon-scene-writer] fresh scene generation failed, falling back to the fixed template pool:", e instanceof Error ? e.message : e);
    return null;
  }
}
