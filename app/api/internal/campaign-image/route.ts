import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateCampaignStill } from "@/lib/campaign-image";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{const body=await req.json().catch(()=>({}));const prompt=String(body.prompt||"").trim();if(!prompt)return NextResponse.json({error:"Campaign image prompt is required"},{status:400});const result=await generateCampaignStill({prompt,avatarId:body.avatarId?String(body.avatarId):null});return NextResponse.json(result,{status:201});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
