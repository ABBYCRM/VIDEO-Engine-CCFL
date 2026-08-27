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
import { runCampaignAutopilotOnce, startCampaignAutopilotLoop } from "@/lib/campaign-autopilot";
import { visualTemplates, type VisualTemplateId } from "@/lib/visual-templates";
import { mandatoryVideoContactDirective } from "@/lib/brand-contact";
import { publicCaptionForSlot } from "@/lib/public-copy";
import { isImageGenEnabled } from "@/lib/feature-flags";
import {
  getImageModel,
  getImageProvider,
  IMAGE_PROVIDER_MODELS,
  isImageProviderId,
  listImageProviders,
  setImageModel,
  setImageProvider
} from "@/lib/avatar-generation/client";

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

const AUTOMATION_CATEGORIES = ["car_accident", "rideshare", "trucking", "slip_fall"] as const;
type AutomationCategory = (typeof AUTOMATION_CATEGORIES)[number];
const AUTOMATION_LABELS: Record<AutomationCategory, string> = { car_accident: "Vehicle accident", rideshare: "Rideshare accident", trucking: "Trucking accident", slip_fall: "Slip & fall" };

function pickAutomationAvatarId(requestedId: string | null) {
  if (requestedId && getAvatar(requestedId)?.status !== "archived") return requestedId;
  const rows = db.prepare("SELECT id FROM avatars WHERE status != 'archived' ORDER BY CASE WHEN reference_image_path IS NULL THEN 1 ELSE 0 END, name ASC").all() as Array<{ id: string }>;
  return rows[0]?.id || null;
}

function automationSchedule(index: number, horizonDays: number) {
  const total = AUTOMATION_CATEGORIES.length;
  const dayOffset = total <= 1 ? 1 : 1 + Math.round(index * (horizonDays - 1) / (total - 1));
  const next = new Date();
  next.setDate(next.getDate() + dayOffset);
  next.setHours(10, 0, 0, 0);
  return next.toISOString();
}

function queueInstagramCategoryAutomation(input: { requestedAvatarId: string | null; templateId: VisualTemplateId; prompt: string; language: string; provider: string; model: string; autoPost: boolean; horizonDays: number; }) {
  const avatarId = pickAutomationAvatarId(input.requestedAvatarId);
  const avatar = avatarId ? getAvatar(avatarId) : null;
  const template = visualTemplates.find((item) => item.id === input.templateId) || visualTemplates[0];
  const templateDirective = "promptHint" in template ? `VISUAL TEMPLATE: ${template.label}. ${template.promptHint}` : "VISUAL TEMPLATE: AUTO — choose the best environment and framing for each category, avatar, and creative brief.";
  const languageDirective = input.language === "es" ? "LANGUAGE: All dialogue and on-screen text must be Spanish." : input.language === "mix" ? "LANGUAGE: Use natural bilingual English and Spanish." : "LANGUAGE: All dialogue and on-screen text must be English.";
  const slots: Array<{ id: string; category: AutomationCategory; title: string; scheduledAt: string }> = [];
  for (const [index, category] of AUTOMATION_CATEGORIES.entries()) {
    const campaignId = crypto.randomUUID(); const slotId = crypto.randomUUID(); const label = AUTOMATION_LABELS[category]; const title = `${label} · Instagram automation`; const scheduledAt = automationSchedule(index, input.horizonDays);
    const mission = [input.prompt ? `Creative brief: ${input.prompt}` : "Create an educational, trustworthy personal-injury awareness post.", `Category focus: ${PROMPTS[category].focus}`, templateDirective, avatar ? `Spokesperson: ${avatar.name}. Wardrobe: ${avatar.wardrobeStandard}.` : "Use a credible adult spokesperson.", languageDirective, mandatoryVideoContactDirective(), "Create one continuous vertical 9:16 video suitable for a Reel and Story. No gore, no guarantees, no legal advice."].join("\n");
    const caption = publicCaptionForSlot({ category, title }).caption;
    db.prepare(`INSERT INTO campaigns(id,name,category,mission,platform,avatar_id,background_id,planning_horizon_days,content_type,output_mode,video_provider,video_model,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(campaignId, title, category, mission, "instagram", avatarId, template.id, input.horizonDays, "cinematic", "video", input.provider, input.model, "active");
    db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,campaign_id,planning_horizon_days,generation_status,category,media_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(slotId, title, "instagram", scheduledAt, input.autoPost ? "approved" : "pending", input.autoPost ? 1 : 0, caption, "cinematic", campaignId, input.horizonDays, "pending", category, "video/mp4");
    slots.push({ id: slotId, category, title, scheduledAt });
  }
  startCampaignAutopilotLoop(); setTimeout(() => { void runCampaignAutopilotOnce(); }, 0);
  return { avatar: avatar ? { id: avatar.id, name: avatar.name } : null, template: { id: template.id, label: template.label }, slots };
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // IMAGE_GEN disabled (2026-08-27) — keep the code, but no more surprise
  // campaigns / images / videos can be created from this endpoint.
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image + video generation is disabled. Use the manual Calendar, Creator tab, or Library.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const tab: Tab = TABS.includes(body.tab) ? body.tab : "ugc";
    const avatarId: string | null = body.avatarId ? String(body.avatarId) : null;
    const avatarGender: "male" | "female" = body.avatarGender === "female" ? "female" : "male";
    const horizonDays = [3, 7, 14, 30, 60].includes(Number(body.horizonDays)) ? Number(body.horizonDays) : 7;
    const outputMode: "image" | "video" | "auto_mix" = ["image","video","auto_mix"].includes(body.outputMode) ? body.outputMode : "auto_mix";
    const approvalMode: "manual" | "auto" = body.approvalMode === "auto" ? "auto" : "auto"; // default auto
    const model = body.model ? String(body.model) : "fal/grok-video-i2v";
    const providerChoice = ["veo","grok","a2e","hedra"].includes(String(body.provider || "")) ? String(body.provider) : "hedra";
    if (body.imageProvider && isImageProviderId(String(body.imageProvider))) {
      setImageProvider(body.imageProvider);
    }
    if (body.imageModel) {
      try { setImageModel(String(body.imageModel)); } catch { /* keep current model if the new one is invalid for the provider */ }
    }
    const imageProviderChoice = getImageProvider();
    const imageModelChoice = getImageModel();
    const defaultDuration = (providerChoice === "grok" || providerChoice === "veo") ? 8 : 15;
    const durationSeconds = Number.isFinite(Number(body.durationSeconds)) && [2,3,5,6,8,10,12,15,20,25,30].includes(Number(body.durationSeconds)) ? Number(body.durationSeconds) : defaultDuration;
    // Language support: 'en', 'es', or 'mix' (English + Spanish in same video)
    const language = ["en","es","mix"].includes(body.language) ? body.language : "mix";
    // Visual template: auto lets AI choose from every available visual template.
    const requestedTemplateId = typeof body.templateId === "string" ? body.templateId : "auto";
    const templateId: VisualTemplateId = visualTemplates.some((template) => template.id === requestedTemplateId)
      ? requestedTemplateId as VisualTemplateId
      : "auto";
    const selectedTemplate = visualTemplates.find((template) => template.id === templateId) || visualTemplates[0];
    const templateDirective = "promptHint" in selectedTemplate
      ? `VISUAL TEMPLATE: ${selectedTemplate.label}. ${selectedTemplate.promptHint}`
      : "VISUAL TEMPLATE: AUTO — choose the most effective environment and framing for the campaign category, spokesperson, and creative brief.";
    if (body.automationMode === "category-run") {
      const automation = queueInstagramCategoryAutomation({ requestedAvatarId: avatarId, templateId, prompt: body.prompt ? String(body.prompt).trim() : "", language, provider: providerChoice, model, autoPost: approvalMode === "auto", horizonDays });
      return NextResponse.json({ automation: true, message: "Queued one calendar post for each core category. Each ready video will publish as one Reel and one Story.", ...automation }, { status: 201 });
    }
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
      templateDirective,
      `Category focus: ${tabMeta.focus}`,
      avatar ? `Spokesperson: ${avatar.name} (${avatarGender}). Wardrobe: ${wardrobe}.` : `Spokesperson gender: ${avatarGender}. Wardrobe: ${wardrobe}.`,
      langDirective,
      mandatoryVideoContactDirective(),
      "Hyper-realistic documentary cinematography, 8K detail, cinematic lighting, broadcast news quality."
    ].filter(Boolean).join("\n");

    const results: any = {
      tab,
      avatarId,
      avatarGender,
      templateId,
      templateLabel: selectedTemplate.label,
      model,
      imageProvider: imageProviderChoice,
      imageModel: imageModelChoice,
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

    // Step 2: Create the video job (Hedra default — Character 3 / Grok Video)
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
        imageMimeType: results.imageAsset?.mimeType || (results.imageAsset?.base64 ? "image/png" : undefined),
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
    horizonOptions: [3, 7, 14, 30, 60],
    outputModes: ["image", "video", "auto_mix"],
    approvalModes: ["auto", "manual"],
    defaultModel: "fal/grok-video-i2v",
    languages: ["en", "es", "mix"],
    defaultLanguage: "mix",
    defaultImageProvider: getImageProvider(),
    defaultImageModel: getImageModel(),
    imageProviders: listImageProviders(),
    imageModels: IMAGE_PROVIDER_MODELS,
    providers: [
      { id: "hedra", label: "Hedra (Character 3 / Grok Video)", defaultModel: "fal/grok-video-i2v", defaultDuration: 15 },
      { id: "a2e", label: "A2E (Sora 2 / Veo 3 / Kling)", defaultModel: "sora2", defaultDuration: 15 },
      { id: "grok", label: "xAI · Grok Imagine Video", defaultModel: "grok-imagine-video-1.5", defaultDuration: 8 },
      { id: "veo", label: "Google · Veo 3.1 (Gemini)", defaultModel: "veo-3.1-generate-preview", defaultDuration: 8 }
    ],
    durations: [2, 3, 5, 6, 8, 10, 12, 15, 20, 25, 30],
    templates: visualTemplates.map((template) => ({
      id: template.id,
      label: template.label,
      description: template.description,
      image: template.image,
      isAuto: template.id === "auto"
    }))
  });
}
