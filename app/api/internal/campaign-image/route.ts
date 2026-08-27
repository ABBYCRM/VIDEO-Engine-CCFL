import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateCampaignStill } from "@/lib/campaign-image";
import { isImageGenEnabled } from "@/lib/feature-flags";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image generation is disabled. Use the manual Calendar, Creator tab, or Library.",
      feature: "image_generation",
      disabled: true
    }, { status: 410 });
  }
  try{const body=await req.json().catch(()=>({}));const prompt=String(body.prompt||"").trim();if(!prompt)return NextResponse.json({error:"Campaign image prompt is required"},{status:400});const result=await generateCampaignStill({prompt,avatarId:body.avatarId?String(body.avatarId):null});return NextResponse.json(result,{status:201});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
