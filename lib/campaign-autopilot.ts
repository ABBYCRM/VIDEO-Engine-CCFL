import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { generateCampaignStill } from "@/lib/campaign-image";
import { createJob, ensureJobOutputPath, getJob, refreshJob } from "@/lib/jobs";
import { getAvatar } from "@/lib/avatars";
import type { CampaignCategory } from "@/lib/prompts";
import type { ProviderId } from "@/lib/providers";
import { planSplitScreen } from "@/lib/nvidia/split-screen-planner";
import { composeSplitSources } from "@/lib/split-compose";
import { publicCaptionForSlot } from "@/lib/public-copy";
import {
  campaignUpperVideoIds,
  ensureUpperVideoColumns,
  materializeUpperVideo,
  pickStockUpperForSlot,
  pickUpperVideoId,
  resolveCampaignAvatarId
} from "@/lib/upper-videos";
import { resolveSplitTemplate } from "@/lib/custom-split-templates";
import { splitTemplateAllowsCategory, pickSplitTemplateForCategory } from "@/lib/split-templates";
import {
  clampSplitDuration,
  clampSplitPercent,
  ensureSplitSurfaceColumns,
  isProviderId,
  laneModel,
  nextLaneFallback,
  normalizeSplitRelationship,
  normalizeUpperProvider,
  unattendedLaneProvider
} from "@/lib/split-surface";
import "@/lib/calendar-assets";

ensureSplitSurfaceColumns();
ensureUpperVideoColumns();

let started=false;
let running=false;
const queuedSlotIds=new Set<string>();

const SLOT_SELECT=`sp.id,sp.title,sp.caption,sp.content_type,sp.generation_status,sp.error,sp.video_job_id,sp.upper_job_id,sp.lower_job_id,sp.scheduled_at,sp.category as slot_category,sp.still_template_id,COALESCE(sp.split_template,c.split_template) as split_template,
           c.name as campaign_name,c.category as campaign_category,c.mission,c.avatar_id,c.video_provider,c.video_model,
           c.upper_provider,c.upper_model,c.split_percent,c.split_relationship,c.split_duration_seconds,c.upper_video_ids`;

function slotCategory(row:any){
  return String(row.slot_category || row.campaign_category || "ugc");
}

export function normalizeCategory(value:string):CampaignCategory{
  if(value==="vehicle_accident")return "car_accident";
  if(value==="rideshare_accident")return "rideshare";
  if(value==="trucking_accident")return "trucking";
  if(value==="car_accident"||value==="rideshare"||value==="trucking"||value==="slip_fall"||value==="ugc")return value;
  return "ugc";
}
function provider(value:string):ProviderId{
  return isProviderId(value) ? value : "hedra";
}

const HEDRA_CHARACTER_MODELS = new Set(["hedra-character-3", "hedra-character-2", "together/hedra-avatar"]);

function fallbackProvider(failed:ProviderId):ProviderId|null{
  return nextLaneFallback(failed);
}

function isRecoverableProviderFailure(error:string){
  // A provider returned an error that another provider might handle:
  //   - A2E-specific patterns (quota, recharge, coins, etc.)
  //   - Hedra / xAI Grok / Veo / fal HTTP 4xx and 5xx (any 400/404/500/502/503)
  //   - Generic provider/transport errors
  // NOT recoverable: input validation failures (the prompt is malformed,
  // not the provider's fault), character/audio constraints (the slot
  // itself needs a different model), or user-supplied content_hash dups.
  return /A2E|rejected task|recharge|remaining time|Request failed|quota|insufficient|coins|Hedra start HTTP [45]\d\d|Grok start HTTP [45]\d\d|Veo start HTTP [45]\d\d|fal start HTTP [45]\d\d|HTTP [45]\d\d/i.test(error);
}

function resolveReferencePath(referenceImagePath: string) {
  if (referenceImagePath.startsWith("/avatars/")) return path.resolve(process.cwd(), "public", referenceImagePath.slice(1));
  if (referenceImagePath.startsWith("/public/")) return path.resolve(process.cwd(), referenceImagePath.slice(1));
  if (referenceImagePath.startsWith("public/")) return path.resolve(process.cwd(), referenceImagePath);
  if (path.isAbsolute(referenceImagePath)) return referenceImagePath;
  return path.resolve(process.cwd(), referenceImagePath);
}
function sniffMime(bytes: Buffer, pathname: string): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  throw new Error("Reference image is not a PNG, JPEG, or WebP file.");
}

async function loadAvatarReference(avatarId: string | null | undefined) {
  const resolved = resolveCampaignAvatarId(avatarId);
  if (!resolved) return null;
  const avatar = getAvatar(resolved);
  if (!avatar) return null;
  const frontView = avatar.views?.front?.file;
  const sourcePath = frontView && avatar.views.front.status === "ready"
    ? frontView
    : avatar.referenceImage;
  if (!sourcePath) return null;
  try {
    const absolute = resolveReferencePath(sourcePath);
    const bytes = await fs.readFile(absolute);
    const mime = sniffMime(bytes, sourcePath);
    return { imageBase64: bytes.toString("base64"), imageMimeType: mime, avatar, avatarId: resolved };
  } catch {
    return null;
  }
}

function campaignSurface(row:any){
  const lowerRequested=provider(String(row.video_provider||"hedra"));
  const upperRequested=normalizeUpperProvider(row.upper_provider, lowerRequested);
  return {
    splitPercent:clampSplitPercent(row.split_percent),
    relationship:normalizeSplitRelationship(row.split_relationship),
    lowerRequested,
    upperRequested,
    lower:unattendedLaneProvider(lowerRequested, row.video_model),
    upper:unattendedLaneProvider(upperRequested, row.upper_model),
    lowerModel:laneModel(unattendedLaneProvider(lowerRequested, row.video_model), row.video_model),
    upperModel:laneModel(unattendedLaneProvider(upperRequested, row.upper_model), row.upper_model)
  };
}

function slotPublicCaption(row:any, plan?:{hook?:string;caption?:string}){
  return publicCaptionForSlot({
    category: normalizeCategory(slotCategory(row)),
    title: row.title,
    hook: plan?.hook,
    caption: plan?.caption || row.caption,
    mission: row.mission
  }).caption;
}

function stockUpperId(row:any){
  // Category-keyed stock library: only for dual-box (top/bottom) templates,
  // where a pre-made clip fills the upper box and the avatar comments on it.
  // Category stock MUST win over legacy/global defaults: the old default can
  // contain generated phone/UI footage and may be unrelated to this topic.
  try{
    const template=resolveSplitTemplate(row.split_template);
    if(template.layout!=="dual-box")return null;
  }catch{return null;}
  const categoryStock=pickStockUpperForSlot(normalizeCategory(slotCategory(row)), String(row.id||row.title||""));
  if(categoryStock)return categoryStock;
  return pickUpperVideoId(campaignUpperVideoIds(row), row.title);
}

// A configured stock upper video only counts if its bytes are actually
// recoverable (persistent library or disk). Uploads that lived on the
// ephemeral disk vanish on redeploy — in that case fall back to
// generating the upper lane instead of failing the slot.
async function usableStockUpperId(row:any){
  const id=stockUpperId(row);
  if(!id)return null;
  try{ await materializeUpperVideo(id); return id; }catch{ return null; }
}

async function startSlotJob(row:any, chosen:ProviderId, avatarRef:{imageBase64:string;imageMimeType:string;avatarId?:string}|null, extra?:{mission?:string;model?:string;script?:string;subject?:string}){
  const variation=extra?.mission || `${row.mission}\nCalendar variation: ${row.title}. Produce a distinct execution for this scheduled post while preserving the campaign message.`;
  const job=await createJob({
    source:"admin",
    provider:chosen,
    category:normalizeCategory(slotCategory(row)),
    mission:variation,
    subject:extra?.subject,
    script:extra?.script,
    aspectRatio:"9:16",
    resolution:"720p",
    durationSeconds:clampSplitDuration(row.split_duration_seconds),
    // Wan 3.0: A2E's model with the widest duration range (3-30s), needed
    // since split-screen lanes now run 15-30s instead of a rushed 8s clip.
    model: extra?.model || laneModel(chosen, row.video_model),
    avatarId: avatarRef?.avatarId || resolveCampaignAvatarId(row.avatar_id) || undefined,
    imageBase64: avatarRef?.imageBase64,
    imageMimeType: avatarRef?.imageMimeType
  });
  return job;
}

async function composeReadySplit(row:any, upper:{id?:string;outputPath?:string;stockId?:string}, lower:{id?:string;outputPath?:string}){
  // A stock upper lane is passed explicitly as {stockId}; a generated lane
  // as {id: jobId}. Never treat a stock library id as a video job id.
  const stockId=upper.stockId||null;
  const upperPath=stockId
    ? await materializeUpperVideo(stockId)
    : (upper.id ? await ensureJobOutputPath(upper.id) : upper.outputPath);
  const lowerPath=lower.id ? await ensureJobOutputPath(lower.id) : lower.outputPath;
  if(!upperPath || !lowerPath)throw new Error("Split-screen lane files could not be restored from persistent storage.");
  const caption=slotPublicCaption(row);
  const composed=await composeSplitSources({
    upperPath,
    lowerPath,
    splitPercent:clampSplitPercent(row.split_percent),
    templateId:row.split_template,
    durationSeconds:clampSplitDuration(row.split_duration_seconds),
    title:row.title,
    caption,
    upperSource:stockId || upper.id,
    lowerSource:lower.id
  });
  db.prepare(`UPDATE scheduled_posts SET media_url=?,media_type=?,source_asset_key=?,caption=?,generation_status='ready',error=NULL,video_job_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    composed.url, composed.mimeType, `composition:${composed.id}`, caption, row.id
  );
}

async function startSplitLanes(row:any, opts?:{upperProvider?:ProviderId;lowerProvider?:ProviderId}){
  // Self-heal: legacy slots picked split templates at random, so a slot can
  // carry a frame whose baked headline belongs to another category. Reassign
  // a compatible frame before planning lanes.
  try{
    const cat=normalizeCategory(slotCategory(row));
    const current=resolveSplitTemplate(row.split_template);
    if(!splitTemplateAllowsCategory(current,cat)){
      const fixed=pickSplitTemplateForCategory(cat);
      row.split_template=fixed.id;
      db.prepare("UPDATE scheduled_posts SET split_template=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(fixed.id,row.id);
    }
  }catch{}
  const surface=campaignSurface(row);
  const upperProvider=opts?.upperProvider || surface.upper;
  const lowerProvider=opts?.lowerProvider || surface.lower;
  const stockId=await usableStockUpperId(row);
  const avatarRef=await loadAvatarReference(row.avatar_id);
  const avatarName=avatarRef?.avatar?.name||null;
  const duration=clampSplitDuration(row.split_duration_seconds);
  const plan=await planSplitScreen({
    category:normalizeCategory(slotCategory(row)),
    relationship:stockId?"context_commentary":surface.relationship,
    upperProvider,
    lowerProvider,
    upperSeconds:duration,
    lowerSeconds:duration,
    lowerAvatarName:avatarName,
    mission:String(row.mission||""),
    title:String(row.title||""),
    upperIsStock:Boolean(stockId)
  });
  const caption=slotPublicCaption(row, plan);
  const lowerMission=`${plan.lower.mission}\nVisual direction: ${plan.lower.visualDirection}\nONE CONTINUOUS SHOT ONLY`;
  const lower=await startSlotJob(row, lowerProvider, avatarRef, {mission:lowerMission, model:laneModel(lowerProvider, row.video_model), script:plan.lower.script, subject:plan.lower.subject});
  if(stockId){
    db.prepare(`UPDATE scheduled_posts SET upper_job_id=NULL,lower_job_id=?,video_job_id=NULL,generation_status='generating',error=NULL,caption=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      lower.id, caption, row.id
    );
    return;
  }
  const upperMission=`${plan.upper.mission}\nVisual direction: ${plan.upper.visualDirection}\nONE CONTINUOUS SHOT ONLY\nSTRICT: photorealistic real-world footage only. NEVER render app interfaces, notification cards, social-media post frames, phone screens, buttons, captions, watermarks, or any text — especially never any words from this brief or internal planning titles. Show the full subject properly framed: no cut-off bodies, no half vehicles unless a deliberate close-up.`;
  const upper=await startSlotJob(row, upperProvider, null, {mission:upperMission, model:laneModel(upperProvider, row.upper_model), script:plan.upper.script, subject:plan.upper.subject});
  db.prepare(`UPDATE scheduled_posts SET upper_job_id=?,lower_job_id=?,video_job_id=NULL,generation_status='generating',error=NULL,caption=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    upper.id, lower.id, caption, row.id
  );
}

async function recoverLane(row:any, lane:"upper"|"lower", failedProvider:ProviderId, error:string){
  if(lane==="upper" && stockUpperId(row)) return false;
  const next=isRecoverableProviderFailure(error)?fallbackProvider(failedProvider):null;
  if(!next)return false;
  const avatarRef=lane==="lower"?await loadAvatarReference(row.avatar_id):null;
  const job=await startSlotJob(row, next, avatarRef, {
    mission:`${row.mission}\nCalendar variation: ${row.title}. ${lane} lane fallback after ${failedProvider} failed.`,
    model:laneModel(next)
  });
  const column=lane==="upper"?"upper_job_id":"lower_job_id";
  db.prepare(`UPDATE scheduled_posts SET ${column}=?,generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(job.id, row.id);
  return true;
}

async function finishSplit(row:any){
  // Trust the slot's actual state: a slot planned with generated lanes has
  // upper_job_id set and must wait on that job, regardless of settings.
  const stockId=row.upper_job_id?null:stockUpperId(row);
  const upper=row.upper_job_id?await refreshJob(row.upper_job_id,{ensureCalendar:false}):null;
  const lower=row.lower_job_id?await refreshJob(row.lower_job_id,{ensureCalendar:false}):null;
  if((!stockId && upper && !["succeeded","failed"].includes(upper.status)) || (lower && !["succeeded","failed"].includes(lower.status)))return true;
  if(!stockId && upper?.status==="failed"){
    try{ if(await recoverLane(row,"upper", provider(String(upper.provider||"")), String(upper.error||""))) return true; }
    catch(e){ db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id); return true; }
    db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(upper.error||"Upper split-screen lane failed").slice(0,2000),row.id);
    return true;
  }
  if(lower?.status==="failed"){
    try{ if(await recoverLane(row,"lower", provider(String(lower.provider||"")), String(lower.error||""))) return true; }
    catch(e){ db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id); return true; }
    db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(lower.error||"Lower split-screen lane failed").slice(0,2000),row.id);
    return true;
  }
  if(lower?.status==="succeeded" && (stockId || upper?.status==="succeeded")){
    try{
      await composeReadySplit(row, stockId ? {stockId} : upper, lower);
    }catch(e){
      db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(`Split-screen compose failed: ${(e instanceof Error?e.message:String(e))}`.slice(0,2000),row.id);
    }
    return true;
  }
  return true;
}

async function startSingleSlot(row:any, chosen:ProviderId, avatarRef:{imageBase64:string;imageMimeType:string;avatarId?:string}|null){
  const job=await startSlotJob(row, chosen, avatarRef, { model: laneModel(chosen, row.video_model) });
  db.prepare("UPDATE scheduled_posts SET video_job_id=?,generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id,row.id);
  return job;
}

async function finishGenerating(slotId?:string){
  const statement=db.prepare(`
    SELECT ${SLOT_SELECT}
    FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
    WHERE sp.generation_status='generating'
      ${slotId?"AND sp.id=?":""}
    ORDER BY sp.scheduled_at ASC LIMIT 1
  `);
  const row=(slotId?statement.get(slotId):statement.get()) as any;
  if(!row)return false;
  if(row.content_type==="podcast" || row.upper_job_id || row.lower_job_id){
    await finishSplit(row);
    return true;
  }
  if(!row.video_job_id)return false;
  const job=await refreshJob(row.video_job_id,{ensureCalendar:false});
  if(!job)return true;
  if(job.status==="succeeded"){
    const caption=slotPublicCaption(row);
    db.prepare(`UPDATE scheduled_posts SET media_url=?,media_type='video/mp4',caption=?,generation_status='ready',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(`/api/v1/video/${row.video_job_id}/file`,caption,row.id);
    return true;
  }
  if(job.status!=="failed")return true;
  const next=fallbackProvider(provider(String(job.provider||"")));
  if(next && isRecoverableProviderFailure(String(job.error||""))){
    try{
      await startSingleSlot(row, next, null);
      return true;
    }catch(e){
      db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);
      return true;
    }
  }
  db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(job.error||"Video generation failed").slice(0,2000),row.id);
  return true;
}

async function generateSplitSlot(row:any){
  // Only honor the stock upper video when its bytes are actually
  // recoverable; otherwise plan generated lanes instead of failing.
  const stockId=row.upper_job_id?null:await usableStockUpperId(row);
  const upper=row.upper_job_id?getJob(row.upper_job_id):null;
  const lower=row.lower_job_id?getJob(row.lower_job_id):null;
  if(lower?.status==="succeeded" && (stockId || upper?.status==="succeeded")){
    try{ await composeReadySplit(row, stockId ? {stockId} : upper, lower); }
    catch(e){ db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(`Split-screen compose failed: ${(e instanceof Error?e.message:String(e))}`.slice(0,2000),row.id); }
    return;
  }
  const surface=campaignSurface(row);
  const retryingA2e=row.generation_status==="failed"&&/A2E/i.test(String(row.error||""));
  const initialUpper:ProviderId=retryingA2e&&surface.upper==="a2e"?"grok":surface.upper;
  const initialLower:ProviderId=retryingA2e&&surface.lower==="a2e"?"grok":surface.lower;
  try{
    await startSplitLanes(row,{upperProvider:initialUpper,lowerProvider:initialLower});
  }catch(e){
    const fallbackUpper=fallbackProvider(initialUpper)||initialUpper;
    const fallbackLower=fallbackProvider(initialLower)||initialLower;
    if(fallbackUpper===initialUpper&&fallbackLower===initialLower){
      db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);
      return;
    }
    try{
      await startSplitLanes(row,{upperProvider:fallbackUpper,lowerProvider:fallbackLower});
    }catch(inner){
      db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((inner instanceof Error?inner.message:String(inner)).slice(0,2000),row.id);
    }
  }
}

async function generateNext(slotId?:string){
  // Keep a 60-day schedule from starting every video immediately.
  const generationCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  // LEFT JOIN campaigns so non-campaign slots (e.g. posts created via
  // /api/creator/upload that the operator scheduled manually, or
  // /api/internal/ugc/batch where the user built a custom sequence)
  // are still picked up. The previous INNER JOIN silently excluded
  // every slot that didn't have a campaign row, leaving them stuck
  // at generation_status='pending' forever — the operator's mobile
  // screenshot on 2026-08-30 showed exactly that. Logic below
  // branches on row.campaign_name being null to use a generic
  // mission / category fallback.
  const statement=db.prepare(`
    SELECT ${SLOT_SELECT}
    FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id
    WHERE sp.media_url IS NULL
      AND sp.status!='published'
      AND sp.scheduled_at <= ?
      AND (
        (sp.generation_status='pending' AND sp.video_job_id IS NULL AND sp.upper_job_id IS NULL AND sp.lower_job_id IS NULL)
        OR (sp.generation_status='failed' AND (
          (sp.content_type='podcast' AND (sp.upper_job_id IS NULL OR sp.error LIKE 'Split-screen compose%'))
          OR (sp.content_type!='podcast' AND (
            sp.error LIKE '%A2E%'
            OR sp.error LIKE '%Hedra%'
            OR sp.error LIKE '%Veo%'
            OR sp.error LIKE '%Grok%'
            OR sp.error LIKE '%fal start%'
            OR sp.error LIKE '%xAI%'
            OR sp.error LIKE '%HTTP [45]%'
            OR sp.error LIKE "%isn't supported%"
            OR sp.error LIKE '%is not supported%'
            OR sp.error LIKE '%not supported by%'
            OR sp.error LIKE '%Unknown model%'
            OR sp.error LIKE '%invalid argument%'
            OR sp.error LIKE '%bad request%'
          ))
        ))
      )
      ${slotId?"AND sp.id=?":""}
    ORDER BY sp.scheduled_at ASC,sp.created_at ASC
    LIMIT 1
  `);
  const row=(slotId?statement.get(generationCutoff,slotId):statement.get(generationCutoff)) as any;
  if(!row)return false;
  if(row.content_type==="image"){
    try{
      db.prepare("UPDATE scheduled_posts SET generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
      const sourceName = row.campaign_name || row.title || "Standalone post";
      const sourceMission = row.mission || row.caption || "Create a distinct visual for this scheduled post.";
      const prompt=`${row.campaign_name ? `Campaign: ${row.campaign_name}. ` : ""}${sourceMission}\nCreate a distinct visual variation for this scheduled post, suitable for Instagram${row.campaign_name ? " and consistent with the campaign" : ""}. Vary the scene, wardrobe, lighting, and camera angle from other posts.`;
      const image=await generateCampaignStill({prompt,avatarId:resolveCampaignAvatarId(row.avatar_id),createCalendarPost:false,stillTemplateId:row.still_template_id,seed:row.id,category:row.slot_category||row.campaign_category||row.category||"ugc"});
      db.prepare(`UPDATE scheduled_posts SET media_url=?,media_type=?,caption=?,generation_status='ready',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(image.assetUrl,image.mimeType,slotPublicCaption(row),row.id);
    }catch(e){db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);}
    return true;
  }
  if(row.content_type==="podcast"){
    db.prepare("UPDATE scheduled_posts SET generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    await generateSplitSlot(row);
    return true;
  }
  // On retry of a previously-failed slot, pick the NEXT provider in the
  // chain (not the same broken one). The earlier code hard-coded "grok"
  // on retry — fine when the original failure was A2E, but a Hedra
  // failure then went to grok, and a grok failure also went to grok
  // (infinite loop). Look at the failed video_job's provider if we can
  // identify it; otherwise fall back to the slot's configured
  // video_provider. The catch block below handles the case where this
  // retry also fails by calling fallbackProvider() on the chosen one.
  const retryingFailed = row.generation_status === "failed";
  let chosenRequested: ProviderId = provider(String(row.video_provider || "hedra"));
  if (retryingFailed) {
    // Identify the provider that previously failed by reading the most
    // recent video_job row for this slot. If we find one, advance past
    // it; if not, use the slot's configured provider as the starting
    // point. This makes the recovery chain deterministic and avoids
    // re-trying the exact same provider that just returned 400/404.
    try {
      const lastJob = db
        .prepare(
          `SELECT provider FROM video_jobs WHERE id=?`
        )
        .get(row.video_job_id) as { provider?: string } | undefined;
      if (lastJob?.provider) {
        const last = provider(String(lastJob.provider));
        const next = fallbackProvider(last);
        if (next) chosenRequested = next;
        else {
          // Already at the end of the chain — every provider has been
          // tried. Mark the slot as pending_manual so the operator
          // can rearm with a different model instead of the loop
          // hammering providers forever.
          db.prepare("UPDATE scheduled_posts SET generation_status='pending_manual',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
            (row.error ? `All providers tried. Last error: ${row.error}. ` : "All providers tried. ") +
            "Rearm the slot with a different model or re-plan the campaign.",
            row.id
          );
          return true;
        }
      }
    } catch {
      /* fall through to the configured provider */
    }
  }
  const avatarRef = !retryingFailed ? await loadAvatarReference(row.avatar_id) : null;
  const videoModel = String(row.video_model || "");
  const characterHedra = chosenRequested === "hedra" && HEDRA_CHARACTER_MODELS.has(videoModel);
  const chosen: ProviderId = chosenRequested;
  if(!retryingFailed && characterHedra){
    db.prepare("UPDATE scheduled_posts SET generation_status='pending_manual',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run("Hedra Character/Avatar needs driving audio. Switch this campaign video model to fal/grok-video-i2v (still-to-video) or generate the slot from Create with audio.",row.id);
    return true;
  }
  try{
    db.prepare("UPDATE scheduled_posts SET generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    await startSingleSlot(row, chosen, avatarRef);
  }catch(e){
    const next = fallbackProvider(chosen);
    if(next){
      try{ await startSingleSlot(row, next, avatarRef); return true; }
      catch(inner){ db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((inner instanceof Error?inner.message:String(inner)).slice(0,2000),row.id); return true; }
    }
    db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);
  }
  return true;
}

export function rewriteUnpublishedCaptions(campaignId?:string){
  const rows = campaignId
    ? db.prepare(`SELECT sp.id,sp.title,sp.caption,sp.category as slot_category,c.category as campaign_category,c.mission FROM scheduled_posts sp JOIN campaigns c ON c.id=sp.campaign_id WHERE sp.campaign_id=? AND sp.status!='published'`).all(campaignId)
    : db.prepare(`SELECT sp.id,sp.title,sp.caption,sp.category as slot_category,c.category as campaign_category,c.mission FROM scheduled_posts sp LEFT JOIN campaigns c ON c.id=sp.campaign_id WHERE sp.status!='published'`).all();
  let changed=0;
  for(const row of rows as any[]){
    const next=slotPublicCaption(row);
    if(next && next !== String(row.caption||"")){
      db.prepare("UPDATE scheduled_posts SET caption=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(next, row.id);
      changed++;
    }
  }
  return changed;
}

export async function runCampaignAutopilotOnce(options:{slotId?:string}={}){
  const slotId=options.slotId?.trim()||undefined;
  if(running){if(slotId)queuedSlotIds.add(slotId);return{processed:0,queued:Boolean(slotId)};}running=true;
  // Deliberately still throws on failure (no catch here): several interactive
  // API routes (rearm-pending, retry-generation, unified/create) await this
  // directly and rely on the throw to surface a real error to the operator
  // instead of a silent {processed:0}. The fire-and-forget scheduler below
  // is the one that needs unhandled-rejection safety, so that's handled at
  // its own call sites instead of swallowing errors here for everyone.
  try{if(await finishGenerating(slotId))return{processed:1,queued:false};if(await generateNext(slotId))return{processed:1,queued:false};return{processed:0,queued:false};}
  finally{
    running=false;
    const next=queuedSlotIds.values().next().value as string|undefined;
    if(next){queuedSlotIds.delete(next);const timer=setTimeout(()=>{runCampaignAutopilotOnce({slotId:next}).catch(e=>console.error("[campaign-autopilot] queued run threw unexpectedly",e));},0);timer.unref?.();}
  }
}

function tickCampaignAutopilot(){
  // .catch() here, not `void` -- runCampaignAutopilotOnce() deliberately still
  // throws on failure for its interactive callers (see the comment on its
  // own try/finally above), but this loop invokes it fire-and-forget on a
  // timer. Since Node 15 an unhandled promise rejection crashes the whole
  // process by default, so an uncaught throw here would silently end every
  // autonomous pipeline in the process, not just this one.
  runCampaignAutopilotOnce().catch(e=>console.error("[campaign-autopilot] scheduled run threw unexpectedly",e));
}

export function startCampaignAutopilotLoop(){
  if(started||process.env.NODE_ENV==="test")return;started=true;
  setTimeout(tickCampaignAutopilot,7_000).unref?.();
  setInterval(tickCampaignAutopilot,20_000).unref?.();
}
