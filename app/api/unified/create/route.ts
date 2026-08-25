// Unified Create API: A2E video gen + library + auto-schedule (1 reel + 1 stories daily)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "node:crypto";
import { getAvatar } from "@/lib/avatars";
import { generateCampaignStill } from "@/lib/campaign-image";
import { saveGeneratedImage } from "@/lib/media-library";
import { createJob, refreshJob } from "@/lib/jobs";
import { ensureAssetCalendarPost, createPlanningSlots } from "@/lib/calendar-assets";
import { runCampaignAutopilotOnce } from "@/lib/campaign-autopilot";

const TABS = ["car_accident","rideshare","trucking","slip_fall","ugc"] as const;
type Tab = (typeof TABS)[number];

const PROMPTS: Record<Tab, { focus: string; wardrobe: string }> = {
  car_accident: {
    focus: "Realistic motor-vehicle accident aftermath: damaged vehicles, road debris, emergency lights in distance, no gore. Photorealistic, hyper-detailed.",
    wardrobe: "tailored blazer, dress shirt, dress pants"
  },
  rideshare: {
    focus: "Realistic rideshare passenger injury context: vehicle interior, app on phone, curbside aftermath. Hyper-real documentary style.",
    wardrobe: "professional business attire"
  },
  trucking: {
    focus: "Commercial tractor-trailer accident scene: realistic scale, damaged cab, road debris, foggy morning. Hyper-realistic, 8K cinematic.",
    wardrobe: "navy suit, white shirt, muted tie"
  },
  slip_fall: {
    focus: "Premises liability hazard: wet floor, poor lighting, unsafe stair, witness on phone. Documentary realism, no comedic motion.",
    wardrobe: "tailored pantsuit"
  },
  ugc: {
    focus: "Authentic creator-style UGC ad: real smartphone optics, natural facial micro-expressions, accurate skin texture, conversational delivery.",
    wardrobe: "smart casual attire"
  }
};

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const tab: Tab = TABS.includes(body.tab) ? body.tab : "ugc";
    const avatarId: string | null = body.avatarId ? String(body.avatarId) : null;
    const avatarGender: "male" | "female" = body.avatarGender === "female" ? "female" : "male";
    const horizonDays = [3, 7, 14, 30].includes(Number(body.horizonDays)) ? Number(body.horizonDays) : 7;
    const outputMode: "image" | "video" | "auto_mix" = ["image","video","auto_mix"].includes(body.outputMode) ? body.outputMode : "auto_mix";
    const approvalMode: "manual" | "auto" = body.approvalMode === "auto" ? "auto" : "auto"; // default auto
    const model = body.model ? String(body.model) : "sora2"; // default A2E Sora 2 Pro for hyper realism
    const providerChoice = body.provider ? String(body.provider) : "a2e";
    // A2E supports 15-30s (Seedance 2.5 etc); Grok Imagine is 8s
    const defaultDuration = providerChoice === "grok" ? 8 : 15;
    const durationSeconds = Number.isFinite(Number(body.durationSeconds)) && [2,3,5,6,8,10,12,15,20,25,30].includes(Number(body.durationSeconds)) ? Number(body.durationSeconds) : defaultDuration;
    // Language support: 'en', 'es', or 'mix' (English + Spanish in same video)
    const language = ["en","es","mix"].includes(body.language) ? body.language : "mix";
    // Visual template: "auto" lets AI pick the best fit based on category & avatar
    const templateId = ["auto","office-modern","office-warm","digital-grid"].includes(body.templateId) ? body.templateId : "auto";
    const userPrompt = body.prompt ? String(body.prompt).trim() : "";

    const tabMeta = PROMPTS[tab];
    const avatar = avatarId ? getAvatar(avatarId) : null;
    const wardrobe = avatar?.wardrobeStandard || tabMeta.wardrobe;

    // Compose the prompt
    const langDirective = language === "mix"
      ? "BILINGUAL MIX: The spokesperson must deliver the same call-to-action in BOTH English and Spanish within the same shot. The spoken dialogue starts in English, then mirrors in Spanish (natural code-switching). All on-screen text and CTAs should be bilingual where space allows."
      : language === "es"
      ? "LANGUAGE: All spoken dialogue, on-screen text, and CTAs must be in SPANISH (Latin American neutral)."
      : "LANGUAGE: All spoken dialogue, on-screen text, and CTAs must be in ENGLISH (US).";

    const finalPrompt = [
      userPrompt,
      `Category focus: ${tabMeta.focus}`,
      avatar ? `Spokesperson: ${avatar.name} (${avatarGender}). Wardrobe: ${wardrobe}.` : `Spokesperson gender: ${avatarGender}. Wardrobe: ${wardrobe}.`,
      langDirective,
      "Hyper-realistic documentary cinematography, 8K detail, cinematic lighting, broadcast news quality."
    ].filter(Boolean).join("\n");

    const results: any = {
      tab,
      avatarId,
      avatarGender,
      model,
      horizonDays,
      outputMode,
      approvalMode,
      language,
      imageAsset: null,
      videoJobId: null,
      scheduledPosts: [],
    };

    // Step 1: Generate hero image (always - this is the canonical frame)
    try {
      const still = await generateCampaignStill({
        prompt: finalPrompt,
        avatarId
      });
      results.imageAsset = still;
      // Save to library
      const saved = await saveGeneratedImage({
        base64: still.base64,
        source: "api",
        model: still.model,
        mimeType: "image/png",
        createCalendarPost: false
      });
      results.imageAsset.savedAsset = saved;
    } catch (e) {
      results.imageWarning = `Hero image skipped: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Step 2: Create the video job (A2E - hyper realism)
    try {
      const job = await createJob({
        source: "api",
        category: tab === "ugc" ? "ugc" : tab,
        mission: finalPrompt,
        provider: providerChoice as any,
        model,
        aspectRatio: "9:16",
        resolution: "1080p",
        avatarId: avatarId ?? undefined,
        imageBase64: results.imageAsset?.base64 ?? undefined,
        durationSeconds: durationSeconds,
      });
      results.videoJobId = job.id;
      results.videoStatus = job.status;
    } catch (e) {
      results.videoError = e instanceof Error ? e.message : String(e);
    }

    // Step 3: Auto-schedule 1 reel + 1 stories per day for the horizon
    // First the "now" reel (immediate post for the just-generated content)
    const titlePrefix = `${(tab as string).replace(/_/g, " ")} · ${avatar?.name || avatarGender}`;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // 5 min from now
    const storyTime = new Date(now);
    storyTime.setHours(20, 0, 0, 0); // 8pm for stories

    if (results.imageAsset?.savedAsset?.assetUrl || results.imageAsset?.url) {
      const imageUrl = results.imageAsset.savedAsset?.assetUrl || results.imageAsset.url;
      // Story (image, posted at 8pm)
      ensureAssetCalendarPost({
        sourceKey: `unified:${tab}:${avatarId || avatarGender}:${now.toISOString().slice(0,10)}:story`,
        title: `${titlePrefix} · Story · ${now.toISOString().slice(0,10)}`,
        contentType: "ugc",
        mediaUrl: imageUrl,
        mediaType: "image/png",
        caption: language === "es" ? `${titlePrefix} - guía legal. #AsesoriaLegal #LesionesPersonales` : language === "mix" ? `${titlePrefix} - legal guidance / guía legal. #LegalAdvice #AsesoriaLegal` : `${titlePrefix} - legal guidance. #LegalAdvice #PersonalInjury`,
        network: "instagram",
        scheduledAt: storyTime,
        approvalMode,
      });
      // Reel slot (video, when ready)
      ensureAssetCalendarPost({
        sourceKey: `unified:${tab}:${avatarId || avatarGender}:${now.toISOString().slice(0,10)}:reel`,
        title: `${titlePrefix} · Reel · ${now.toISOString().slice(0,10)}`,
        contentType: tab === "ugc" ? "ugc" : "cinematic",
        mediaUrl: null, // will be filled when video completes
        mediaType: "video/mp4",
        caption: language === "es" ? `${titlePrefix} - noticias legales. #NoticiasLegales #Abogado` : language === "mix" ? `${titlePrefix} - legal news / noticias legales. #LegalNews #NoticiasLegales #Attorney` : `${titlePrefix} - hyper-real AI legal news. #LegalNews #Reels`,
        network: "instagram",
        scheduledAt: now,
        videoJobId: results.videoJobId,
        approvalMode,
        generationStatus: results.videoJobId ? "generating" : "pending",
      });
    }

    // Additional planning slots for the horizon (1 reel + 1 stories per day)
    const slotIds = createPlanningSlots({
      horizonDays,
      titlePrefix: titlePrefix,
      contentType: "ugc",
      network: "instagram",
      campaignId: null,
      approvalMode,
      cadence: "daily",
      outputMode: "auto_mix" // alternate reel/image
    });
    results.scheduledPosts = slotIds;

    // Step 4: Trigger the campaign autopilot so it picks up the job ASAP
    setTimeout(() => { void runCampaignAutopilotOnce(); }, 1000);

    return NextResponse.json(results, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Return the list of avatars for the bottom picker
  const rows = db.prepare("SELECT id, name, gender, archetype, status, reference_image_path FROM avatars WHERE status != 'archived' ORDER BY name").all() as any[];
  return NextResponse.json({
    tabs: TABS,
    prompts: PROMPTS,
    avatars: rows.map(r => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      archetype: r.archetype,
      hasReference: Boolean(r.reference_image_path)
    })),
    horizonOptions: [3, 7, 14, 30],
    outputModes: ["image", "video", "auto_mix"],
    approvalModes: ["auto", "manual"],
    defaultModel: "sora2",
    languages: ["en", "es", "mix"],
    defaultLanguage: "mix",
    providers: [
      { id: "a2e", label: "A2E (Sora 2 / Veo 3 / Kling)", defaultModel: "sora2", defaultDuration: 15 },
      { id: "grok", label: "xAI · Grok Imagine Video", defaultModel: "grok-imagine-video-1.5", defaultDuration: 8 }
    ],
    durations: [2, 3, 5, 6, 8, 10, 12, 15, 20, 25, 30],
    templates: [
      { id: "auto", label: "Auto (AI picks best fit)" },
      { id: "office-modern", label: "Office — Modern" },
      { id: "office-warm", label: "Office — Warm" },
      { id: "digital-grid", label: "Digital Grid" }
    ]
  });
}
