import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getAvatarImageModel,
  getAvatarImageProvider,
  isAvatarImageProviderConfigured,
  listAvatarImageModelChoices,
  listAvatarImageProviders,
  saveAvatarImageApiKey,
  setAvatarImageModel,
  setAvatarImageProvider,
  type AvatarImageProvider
} from "@/lib/avatar-generation/provider";

function payload(){return{configured:isAvatarImageProviderConfigured(),provider:getAvatarImageProvider(),model:getAvatarImageModel(),providers:listAvatarImageProviders(),modelChoices:listAvatarImageModelChoices(),maskedKey:null};}
function clearStaleGenerationState(){
  db.prepare("UPDATE avatar_views SET generation_status='idle',generation_error=NULL,generation_finished_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE generation_status IN ('failed','generating')").run();
  db.exec(`UPDATE avatars SET turnaround_error=NULL,turnaround_status=CASE WHEN (SELECT COUNT(*) FROM avatar_views v WHERE v.avatar_id=avatars.id AND v.status='ready')=4 THEN 'ready' ELSE 'incomplete' END,updated_at=CURRENT_TIMESTAMP`);
}
function repairIncompatibleState(){
  if(getAvatarImageProvider()!=="nvidia")return;
  const incompatible=(db.prepare("SELECT COUNT(*) AS n FROM avatar_views WHERE generation_status IN ('failed','generating') OR lower(coalesce(generation_error,'')) LIKE '%example_id%' OR lower(coalesce(generation_error,'')) LIKE '%base64%'").get() as {n:number}).n;
  if(incompatible>0)clearStaleGenerationState();
}

export async function GET(){if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});repairIncompatibleState();return NextResponse.json(payload());}
export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!process.env.IMAGE_GEN_ENABLED) {
    return NextResponse.json({
      error: "Image generation is disabled. Avatar image provider switching is paused.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
  try{
    const body=await req.json().catch(()=>({}));
    if(body.provider){
      const provider=String(body.provider) as AvatarImageProvider;
      if(!["nvidia","hedra","a2e","gemini","openai","xai","mock"].includes(provider))return NextResponse.json({error:"Invalid provider"},{status:400});
      const previous=getAvatarImageProvider();setAvatarImageProvider(provider);if(previous!==provider||provider==="nvidia")clearStaleGenerationState();
    }
    if(body.model&&listAvatarImageModelChoices().includes(String(body.model)))setAvatarImageModel(String(body.model));
    if(body.apiKey)saveAvatarImageApiKey(String(body.apiKey));
    repairIncompatibleState();
    return NextResponse.json(payload());
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
