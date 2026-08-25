import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createPlanningSlots } from "@/lib/calendar-assets";

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({})); const horizonDays=Number(body.horizonDays||7);
  if(![3,7,14,30,60].includes(horizonDays))return NextResponse.json({error:"horizonDays must be 3, 7, 14, 30, or 60"},{status:400});
  const contentType=String(body.contentType||"blog"),titlePrefix=String(body.titlePrefix||"Planned content").trim();
  if(!titlePrefix)return NextResponse.json({error:"titlePrefix is required"},{status:400});
  const ids=createPlanningSlots({horizonDays,titlePrefix,contentType,network:String(body.network||"instagram"),caption:String(body.caption||""),campaignId:body.campaignId?String(body.campaignId):null,siteId:body.siteId?String(body.siteId):null,approvalMode:body.approvalMode==="auto"?"auto":"manual",cadence:["daily","3-week","weekly","manual"].includes(body.cadence)?body.cadence:"daily"});
  return NextResponse.json({ok:true,count:ids.length,ids},{status:201});
}
