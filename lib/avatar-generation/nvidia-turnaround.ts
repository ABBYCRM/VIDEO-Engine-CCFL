import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { editAvatarImage } from "@/lib/nvidia/image";
import { VIEWS, type AvatarView } from "@/lib/avatars";

const ROTATION_PROMPT_BASE = "Edit the supplied reference portrait into another camera angle of the SAME adult person. Preserve exact facial identity, eye color and shape, skin tone, hairstyle, canonical wardrobe items and colors, body proportions, environment, lighting direction, camera distance and lens character. Photorealistic natural skin texture, realistic eyes and teeth, no beauty-filter plastic skin, one adult person only. ";
const VIEW_PROMPTS: Record<AvatarView,string> = {
  front: ROTATION_PROMPT_BASE + "Camera: canonical straight-on front view at eye level, subject looking into lens.",
  left: ROTATION_PROMPT_BASE + "Camera rotates around the subject to show a left-side three-quarter/profile view. Do not mirror wardrobe details.",
  right: ROTATION_PROMPT_BASE + "Camera rotates around the subject to show a right-side three-quarter/profile view. Do not mirror wardrobe details.",
  back: ROTATION_PROMPT_BASE + "Camera rotates 180 degrees behind the subject, showing the back of hair, shoulders and the exact same outfit."
};

function resolveReferencePath(referenceImagePath:string){
  if(referenceImagePath.startsWith("/avatars/"))return path.resolve(process.cwd(),"public",referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("/public/"))return path.resolve(process.cwd(),referenceImagePath.slice(1));
  if(referenceImagePath.startsWith("public/"))return path.resolve(process.cwd(),referenceImagePath);
  if(path.isAbsolute(referenceImagePath))return referenceImagePath;
  return path.resolve(process.cwd(),referenceImagePath);
}
function mimeFor(pathname:string){const lower=pathname.toLowerCase();return lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":"image/jpeg";}
function patchView(avatarId:string,view:AvatarView,patch:Record<string,unknown>){const entries=Object.entries(patch).filter(([,v])=>v!==undefined);if(!entries.length)return;const values=entries.map(([,v])=>v);values.push(avatarId,view);db.prepare(`UPDATE avatar_views SET ${entries.map(([k])=>`${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=?`).run(...values);}
function patchAvatar(avatarId:string,patch:Record<string,unknown>){const entries=Object.entries(patch).filter(([,v])=>v!==undefined);if(!entries.length)return;const values=entries.map(([,v])=>v);values.push(avatarId);db.prepare(`UPDATE avatars SET ${entries.map(([k])=>`${k}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values);}
async function saveView(avatarId:string,view:AvatarView,png:Buffer){const dir=path.resolve(process.cwd(),"public","avatars",avatarId);await fs.mkdir(dir,{recursive:true});const absolute=path.join(dir,`${view}.png`);await fs.writeFile(absolute,png);return `/avatars/${avatarId}/${view}.png`;}

async function run(avatarId:string,views:AvatarView[]){
  const avatar=db.prepare("SELECT reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as {reference_image_path:string|null;archetype:string;wardrobe_standard:string}|undefined;
  if(!avatar?.reference_image_path)return;
  const referencePath=resolveReferencePath(avatar.reference_image_path);
  const bytes=await fs.readFile(referencePath);
  for(const view of views){
    const prompt=`${VIEW_PROMPTS[view]}\nArchetype: ${avatar.archetype}.\nWardrobe standard: ${avatar.wardrobe_standard}.`;
    try{
      const result=await editAvatarImage({prompt,imageBase64:bytes.toString("base64"),imageMimeType:mimeFor(referencePath)});
      const publicPath=await saveView(avatarId,view,Buffer.from(result.base64,"base64"));
      patchView(avatarId,view,{file_path:publicPath,status:"ready",generation_status:"ready",generation_model:result.model,generation_prompt:prompt,generation_error:null,generation_finished_at:new Date().toISOString()});
      db.prepare("UPDATE avatar_generations SET result_path=?,status='ready',finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating'").run(publicPath,avatarId,view);
    }catch(e){const message=e instanceof Error?e.message:String(e);patchView(avatarId,view,{generation_status:"failed",generation_error:message,generation_finished_at:new Date().toISOString()});db.prepare("UPDATE avatar_generations SET status='failed',error=?,finished_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=? AND status='generating'").run(message,avatarId,view);}
  }
  const ready=(db.prepare("SELECT COUNT(*) n FROM avatar_views WHERE avatar_id=? AND status='ready'").get(avatarId) as {n:number}).n;
  const failed=(db.prepare("SELECT COUNT(*) n FROM avatar_views WHERE avatar_id=? AND generation_status='failed'").get(avatarId) as {n:number}).n;
  patchAvatar(avatarId,{turnaround_status:ready===4?"ready":failed?"failed":"incomplete",turnaround_finished_at:new Date().toISOString(),turnaround_error:failed?`${failed} view${failed===1?"":"s"} failed with NVIDIA FLUX.2 Klein`:null,status:ready===4?"ready":"draft"});
}

export async function startNvidiaTurnaround(avatarId:string,opts:{views?:AvatarView[]}={}){
  const wanted=opts.views?.length?opts.views:VIEWS;
  const avatar=db.prepare("SELECT id,reference_image_path,archetype,wardrobe_standard FROM avatars WHERE id=?").get(avatarId) as {id:string;reference_image_path:string|null;archetype:string;wardrobe_standard:string}|undefined;
  if(!avatar)throw new Error("Avatar not found");
  if(!avatar.reference_image_path)return {started:[] as AvatarView[],skipped:wanted,reason:"Upload or generate a reference identity photo first."};
  const model="black-forest-labs/flux.2-klein-4b";const now=new Date().toISOString();
  for(const view of wanted){const prompt=`${VIEW_PROMPTS[view]}\nArchetype: ${avatar.archetype}.\nWardrobe standard: ${avatar.wardrobe_standard}.`;db.prepare("INSERT INTO avatar_generations(id,avatar_id,view,model,prompt,reference_image_path,status) VALUES(?,?,?,?,?,?,'generating')").run(crypto.randomUUID(),avatarId,view,model,prompt,avatar.reference_image_path);patchView(avatarId,view,{generation_status:"generating",generation_model:model,generation_prompt:prompt,generation_error:null,generation_started_at:now,generation_finished_at:null});}
  patchAvatar(avatarId,{turnaround_status:"generating",turnaround_model:model,turnaround_started_at:now,turnaround_finished_at:null,turnaround_error:null});
  void run(avatarId,[...wanted]);
  return {started:[...wanted],skipped:[] as AvatarView[]};
}
