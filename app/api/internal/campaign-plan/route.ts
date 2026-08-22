import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { planCampaign } from "@/lib/nvidia/campaign-planner";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));
  try{
    const plan=await planCampaign({category:String(body.category||"ugc"),provider:String(body.provider||"veo"),durationSeconds:Number(body.durationSeconds||8),avatarName:body.avatarName?String(body.avatarName):null});
    return NextResponse.json({plan});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
