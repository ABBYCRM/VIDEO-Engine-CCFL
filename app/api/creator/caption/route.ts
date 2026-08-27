import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";
import { db } from "@/lib/db";
import { applyBrandFooter, BRAND_FOOTER } from "@/lib/brand-footer";

export const runtime = "nodejs";

/**
 * POST /api/creator/caption
 * Body: { subject: string, category: string, format: "reel" | "story" | "post", topic?: string }
 *
 * Generates an Instagram caption via the NVIDIA LLM:
 *  - emoji opener + subject hook
 *  - 2-3 short paragraphs of body copy
 *  - 3-5 relevant hashtags
 *  - CTA: "caseclosedfl.com | (561) 566-1360" with a "Free case review" signoff
 *
 * Returns: { caption, hashtags, cta }
 */

const PHONE = "(561) 566-1360";
const URL = "caseclosedfl.com";
const FIRM = "Case Closed FL";

function fallbackCaption(subject: string, format: "reel" | "story" | "post") {
  // Hard-coded safety net so the operator can always save something even if
  // NVIDIA is rate-limited or the request fails.
  const opener = format === "story"
    ? "📍 Tap through for a free case review."
    : "🚨 Don't let this happen to you.";
  const body = `If you or a loved one was hurt, you have rights.\n\nWe fight the insurance companies so you can focus on healing.\n\nFree eligibility check. No pressure. No fees until you win.`;
  const caption = applyBrandFooter(`${opener} ${subject}\n\n${body}`);
  return { caption, hashtags: ["#CaseClosedFL", "#FloridaAttorney", "#PersonalInjuryLawyer", "#InjuryAttorney", "#FreeCaseReview"], cta: `Call ${PHONE} or visit ${URL}` };
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Body must be an object" }, { status: 400 });

  const subject = String(body.subject || "").trim().slice(0, 200);
  const category = String(body.category || "ugc").trim();
  const format = (["reel", "story", "post"].includes(String(body.format)) ? String(body.format) : "reel") as "reel" | "story" | "post";
  const topic = String(body.topic || "").trim().slice(0, 200);

  if (!subject) return NextResponse.json({ error: "subject is required" }, { status: 400 });

  const fallback = fallbackCaption(subject, format);
  try {
    const prompt = [
      {
        role: "system" as const,
        content: `You write Instagram captions for the personal-injury law firm Case Closed FL. Hard rules — no exceptions:

1. Firm: Case Closed FL. NOT a law firm. No legal advice. No outcome guarantees. Never claim results.
2. Phone: ${PHONE}. URL: ${URL}. Always include both, exactly as written.
3. Emoji: lead with 1-2 emoji, then sprinkle 1-2 more throughout the body. Don't overdo it.
4. Format: ${format}. For "reel" the caption goes under a video; for "story" it should be a short tap-through prompt; for "post" it stands alone with a single image or video. Match the format's natural reading flow.
5. Length: ${format === "story" ? "1-2 sentences max" : "2-4 short paragraphs (under 700 chars total)"}.
6. Hashtags: exactly 3-5. Use a mix of branded (#CaseClosedFL) and category-relevant (e.g. #FloridaAttorney, #CarAccidentLawyer). No hashtag spam. No emoji in hashtags.
7. CTA: end with the phone + URL on a new line, then a "Free case review" or "Free eligibility check" signoff. No exclamation chains.
8. Never invent case facts, outcomes, settlement amounts, or testimonials. The operator supplies the subject — write the hook, not the result.
9. Plain language. Florida Spanish-speaking audience is part of the mix; the brand voice is bilingual-friendly but the response should be in English.
10. CLOSER (operator-locked, never rewrite): the LAST three lines of the caption must be exactly these three lines, in this order, with a blank line before them:
    Visit CaseClosedFL.com or call (561) 566-1360 for a free consultation, no pressure.
    General information only—not legal advice.
    #Florida #SlipAndFall #CaseClosedFL
   The "#SlipAndFall" hashtag may be swapped for a category-relevant tag (e.g. #CarAccident, #TruckingAccident) — but the first and second lines, the exact URL/phone, and the closing #CaseClosedFL are LOCKED.
11. Return ONLY a JSON object: { caption: string, hashtags: string[], cta: string }.

Subject the operator wants the caption to be about: ${subject}
Category on the site: ${category}${topic ? "\nOperator-picked topic angle: " + topic : ""}`
      },
      {
        role: "user" as const,
        content: "Write the caption now. Return only the JSON."
      }
    ];

    const response = await chatCompletion({
      model: getNvidiaModel(),
      temperature: 0.7,
      maxTokens: 800,
      jsonMode: true,
      messages: prompt
    });

    const text = (response.text || "").trim();
    // Strip code-fence if the model returned one
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { caption?: string; hashtags?: string[]; cta?: string };
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON shape");
    const caption = applyBrandFooter(String(parsed.caption || "")).slice(0, 4900);
    const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.filter(h => typeof h === "string").slice(0, 5) : fallback.hashtags;
    const cta = String(parsed.cta || fallback.cta).slice(0, 500);
    if (!caption) throw new Error("Empty caption");
    return NextResponse.json({ caption, hashtags, cta, model: response.rawModel, source: "nvidia" });
  } catch (e) {
    // Don't block the operator's flow on NVIDIA failure — return a clean fallback
    return NextResponse.json({
      ...fallback,
      source: "fallback",
      error: e instanceof Error ? e.message : String(e)
    });
  }
}
