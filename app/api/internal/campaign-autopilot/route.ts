import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCampaignAutopilotOnce } from "@/lib/campaign-autopilot";

export async function POST(){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await runCampaignAutopilotOnce());}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
}
