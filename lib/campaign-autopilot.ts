import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { generateCampaignStill } from "@/lib/campaign-image";
import { createJob, refreshJob } from "@/lib/jobs";
import { getAvatar } from "@/lib/avatars";
import type { CampaignCategory } from "@/lib/prompts";
import type { ProviderId } from "@/lib/providers";

let started=false;
let running=false;

function normalizeCategory(value:string):CampaignCategory{
  if(value==="vehicle_accident")return "car_accident";
  if(value==="rideshare_accident")return "rideshare";
  if(value==="trucking_accident")return "trucking";
  if(value==="car_accident"||value==="rideshare"||value==="trucking"||value==="slip_fall"||value==="ugc")return value;
  return "ugc";
}
function provider(value:string):ProviderId{return value==="grok"||value==="a2e"||value==="hedra"?value:"veo";}

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
  if (!avatarId) return null;
  const avatar = getAvatar(avatarId);
  if (!avatar) return null;
  // Prefer the canonical front view if it's ready; fall back to the reference photo.
  const frontView = avatar.views?.front?.file;
  const sourcePath = frontView && avatar.views.front.status === "ready"
    ? frontView
    : avatar.referenceImage;
  if (!sourcePath) return null;
  try {
    const absolute = resolveReferencePath(sourcePath);
    const bytes = await fs.readFile(absolute);
    const mime = sniffMime(bytes, sourcePath);
    return { imageBase64: bytes.toString("base64"), imageMimeType: mime, avatar };
  } catch {
    return null;
  }
}

async function finishGenerating(){
  const row=db.prepare(`SELECT sp.id,sp.video_job_id FROM scheduled_posts sp WHERE sp.campaign_id IS NOT NULL AND sp.generation_status='generating' AND sp.video_job_id IS NOT NULL ORDER BY sp.scheduled_at ASC LIMIT 1`).get() as {id:string;video_job_id:string}|undefined;
  if(!row)return false;
  const job=await refreshJob(row.video_job_id,{ensureCalendar:false});
  if(!job)return true;
  if(job.status==="succeeded")db.prepare(`UPDATE scheduled_posts SET media_url=?,media_type='video/mp4',generation_status='ready',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(`/api/v1/video/${row.video_job_id}/file`,row.id);
  else if(job.status==="failed")db.prepare(`UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(job.error||"Video generation failed").slice(0,2000),row.id);
  return true;
}

async function generateNext(){
  const row=db.prepare(`SELECT sp.id,sp.title,sp.content_type,sp.caption,c.name as campaign_name,c.category,c.mission,c.avatar_id,c.video_provider FROM scheduled_posts sp JOIN campaigns c ON c.id=sp.campaign_id WHERE sp.campaign_id IS NOT NULL AND sp.generation_status='pending' AND sp.media_url IS NULL AND sp.video_job_id IS NULL ORDER BY sp.scheduled_at ASC,sp.created_at ASC LIMIT 1`).get() as any;
  if(!row)return false;
  if(row.content_type==="image"){
    try{
      db.prepare("UPDATE scheduled_posts SET generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
      const prompt=`Campaign: ${row.campaign_name}. ${row.mission}\nCalendar variation: ${row.title}. Create a distinct visual variation for this scheduled post, suitable for Instagram and consistent with the campaign.`;
      const image=await generateCampaignStill({prompt,avatarId:row.avatar_id||null,createCalendarPost:false});
      db.prepare(`UPDATE scheduled_posts SET media_url=?,media_type=?,caption=?,generation_status='ready',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(image.assetUrl,image.mimeType,String(row.caption||row.mission||"").slice(0,5000),row.id);
    }catch(e){db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);}
    return true;
  }
  const chosenRequested=provider(String(row.video_provider||"veo"));
  // Hedra requires driving audio for every slot — unsuitable for unattended
  // campaign autopilot. Auto-route to A2E v2 image-to-video (native audio,
  // no driving audio file required) when the campaign's avatar has a
  // canonical front view ready; otherwise fall through to text-to-video
  // with Seedance 2.5 (also native audio).
  const avatarRef = chosenRequested === "hedra" ? await loadAvatarReference(row.avatar_id) : null;
  const chosen: ProviderId = chosenRequested === "hedra" && !avatarRef ? "a2e" : (chosenRequested === "hedra" ? "a2e" : chosenRequested);
  const fallbackModel = chosen === "a2e" ? (avatarRef ? "a2e-v2-i2v" : "seedance2.5") : undefined;
  if(chosenRequested==="hedra" && !avatarRef){
    db.prepare("UPDATE scheduled_posts SET generation_status='pending_manual',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run("Hedra requires driving audio for each avatar video. The autopilot routed this slot to A2E (seedance2.5 native audio) but the campaign avatar has no canonical front view yet. Upload an identity reference and run Generate all 4 on the Avatars page, then Approve this slot to retry.",row.id);
    return true;
  }
  try{
    db.prepare("UPDATE scheduled_posts SET generation_status='generating',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    const variation=`${row.mission}\nCalendar variation: ${row.title}. Produce a distinct execution for this scheduled post while preserving the campaign message.`;
    const job=await createJob({
      source:"admin",
      provider:chosen,
      category:normalizeCategory(String(row.category||"ugc")),
      mission:variation,
      aspectRatio:"9:16",
      model:fallbackModel,
      avatarId: row.avatar_id || undefined,
      imageBase64: avatarRef?.imageBase64,
      imageMimeType: avatarRef?.imageMimeType
    });
    db.prepare("UPDATE scheduled_posts SET video_job_id=?,generation_status='generating',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id,row.id);
  }catch(e){db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),row.id);}
  return true;
}

export async function runCampaignAutopilotOnce(){
  if(running)return{processed:0};running=true;
  try{if(await finishGenerating())return{processed:1};if(await generateNext())return{processed:1};return{processed:0};}
  finally{running=false;}
}

export function startCampaignAutopilotLoop(){
  if(started||process.env.NODE_ENV==="test")return;started=true;
  setTimeout(()=>{void runCampaignAutopilotOnce();},7_000).unref?.();
  setInterval(()=>{void runCampaignAutopilotOnce();},20_000).unref?.();
}
