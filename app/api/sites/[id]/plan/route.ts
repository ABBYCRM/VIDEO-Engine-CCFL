import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateBlogPlan } from "@/lib/nvidia/blog-writer";
import { getSite } from "@/lib/sites";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";
import { startBlogAutopilotLoop } from "@/lib/blog-autopilot";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const{id}=await params,site=getSite(id);if(!site)return NextResponse.json({error:"Site not found"},{status:404});
  const body=await req.json().catch(()=>({})),horizonDays=Number(body.horizonDays||7);if(![3,7,14,30].includes(horizonDays))return NextResponse.json({error:"horizonDays must be 3, 7, 14, or 30"},{status:400});
  try{
    const drafts=await generateBlogPlan(id,horizonDays);
    const calendarIds=drafts.map(d=>ensureAssetCalendarPost({
      sourceKey:`blog:${d.id}`,
      title:d.title,
      contentType:"blog",
      network:"website",
      caption:`${d.excerpt}\n\nOutline:\n${d.outline.map((x:string)=>`- ${x}`).join("\n")}\n\nFeature image: ${site.imageEnabled?`${site.imageStyle} · ${site.imageAspectRatio}`:"disabled"}`.slice(0,5000),
      siteId:id,
      scheduledAt:new Date(d.scheduledAt),
      planningHorizonDays:horizonDays,
      slug:d.slug,
      generationStatus:"pending",
      approvalMode:site.approvalMode==="auto"?"auto":"manual"
    }));
    db.prepare("UPDATE sites SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
    startBlogAutopilotLoop();
    return NextResponse.json({ok:true,count:drafts.length,drafts,calendarIds,autopilot:true},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
}
