import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCampaignAutopilotOnce } from "@/lib/campaign-autopilot";
import { isImageGenEnabled } from "@/lib/feature-flags";

export async function POST(){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!isImageGenEnabled()) {
    return NextResponse.json({
      error: "Image generation is disabled. Campaign autopilot is paused.",
      feature: "image_generation",
      disabled: true,
      dryRun: true,
      ran: 0
    }, { status: 410 });
  }
  try{return NextResponse.json(await runCampaignAutopilotOnce());}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
}
