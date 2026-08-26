import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { resolveSplitTemplate } from "@/lib/custom-split-templates";
import { planSplitScreen } from "@/lib/nvidia/split-screen-planner";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));
  try{const template=resolveSplitTemplate(body.templateId?String(body.templateId):null);return NextResponse.json({plan:await planSplitScreen({category:String(body.category||"ugc"),relationship:String(body.relationship||"context_commentary"),upperProvider:String(body.upperProvider||"veo"),lowerProvider:String(body.lowerProvider||"hedra"),upperSeconds:Number(body.upperSeconds||8),lowerSeconds:Number(body.lowerSeconds||30),lowerAvatarName:body.lowerAvatarName?String(body.lowerAvatarName):null,templatePurpose:template.purpose,videoPromptHints:template.videoPromptHints})});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
