import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listGeneratedImages } from "@/lib/media-library";
import { listPersistentLibraryAssets, persistentLibraryConfigured } from "@/lib/persistent-library";

const VIEWS=["front","left","right","back"] as const;
export async function GET(){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const persistent=await listPersistentLibraryAssets().catch(()=>[]);
  const generated=listGeneratedImages().map(image=>({id:`generated:${image.id}`,kind:"generated",mediaType:"image",label:image.source==="nvidia-avatar"?"Generated avatar":image.source,title:image.model||"Generated image",url:image.url,model:image.model,prompt:image.prompt,createdAt:image.createdAt}));
  const avatars=db.prepare("SELECT id,name,reference_image_path,created_at FROM avatars ORDER BY created_at DESC").all() as Array<any>;const avatarAssets:Array<any>=[];
  for(const avatar of avatars){if(avatar.reference_image_path)avatarAssets.push({id:`avatar:${avatar.id}:reference`,kind:"reference",mediaType:"image",label:"Identity reference",title:avatar.name,url:`/api/admin/avatars/${avatar.id}/asset?view=reference`,model:null,prompt:null,createdAt:avatar.created_at});const views=db.prepare("SELECT view,status,generation_model,generation_prompt,updated_at FROM avatar_views WHERE avatar_id=?").all(avatar.id) as Array<any>;for(const view of VIEWS){const row=views.find(v=>v.view===view);if(row?.status!=="ready")continue;avatarAssets.push({id:`avatar:${avatar.id}:${view}`,kind:"turnaround",mediaType:"image",label:`${view} view`,title:avatar.name,url:`/api/admin/avatars/${avatar.id}/asset?view=${view}`,model:row.generation_model,prompt:row.generation_prompt,createdAt:row.updated_at})}}
  const videos=(db.prepare("SELECT id,category,provider,model,status,created_at,updated_at FROM video_jobs WHERE status='succeeded' AND output_path IS NOT NULL ORDER BY updated_at DESC").all() as Array<any>).map(v=>({id:`video:${v.id}`,kind:"video",mediaType:"video",label:`${String(v.category||"campaign").replaceAll("_"," ")} video`,title:`${String(v.provider||"AI").toUpperCase()} generated video`,url:`/api/v1/video/${v.id}/file`,model:v.model||v.provider||null,prompt:null,createdAt:v.updated_at||v.created_at}));
  let compositions:Array<any>=[];try{compositions=(db.prepare("SELECT id,title,file_path,mime_type,split_percent,created_at FROM generated_compositions ORDER BY created_at DESC").all() as Array<any>).map(c=>({id:`composition:${c.id}`,kind:"composition",mediaType:"video",label:`Split-screen · ${c.split_percent}% top`,title:c.title,url:c.file_path,model:"browser composition",prompt:null,createdAt:c.created_at}))}catch{}
  const deduped=new Map<string,any>();for(const asset of [...persistent,...generated,...avatarAssets,...videos,...compositions])if(!deduped.has(asset.id))deduped.set(asset.id,asset);
  const assets=[...deduped.values()].sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime());return NextResponse.json({assets,persistence:persistentLibraryConfigured()?"novaluis":"local-fallback"});
}
