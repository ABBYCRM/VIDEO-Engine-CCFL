import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runCampaignAutopilotOnce, startCampaignAutopilotLoop } from "@/lib/campaign-autopilot";
import "@/lib/calendar-assets";

const RETRYABLE = new Set(["failed", "pending_manual"]);

function rowToPost(row:any){
  return {
    id:row.id,
    title:row.title,
    network:row.network,
    scheduledAt:row.scheduled_at,
    status:row.status,
    autoPost:Boolean(row.auto_post),
    contentType:row.content_type||"ugc",
    videoJobId:row.video_job_id,
    upperJobId:row.upper_job_id,
    lowerJobId:row.lower_job_id,
    mediaUrl:row.media_url,
    mediaType:row.media_type,
    campaignId:row.campaign_id,
    generationStatus:row.generation_status||"ready",
    error:row.error
  };
}

export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const{id}=await params;
  const current=db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
  if(!current)return NextResponse.json({error:"Not found"},{status:404});
  if(!current.campaign_id)return NextResponse.json({error:"Only campaign-generated Calendar items can retry generation"},{status:409});
  if(current.status==="published"||current.published_at)return NextResponse.json({error:"Published items cannot be regenerated"},{status:409});
  if(!RETRYABLE.has(String(current.generation_status||"")))return NextResponse.json({error:`Generation is ${current.generation_status||"ready"}; only failed generations can be retried`},{status:409});

  const retryingA2e=current.generation_status==="failed"&&/A2E/i.test(String(current.error||""));
  const reset=db.prepare(`
    UPDATE scheduled_posts
    SET video_job_id=NULL,upper_job_id=NULL,lower_job_id=NULL,media_url=NULL,media_type=NULL,
        generation_status=?,error=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND campaign_id IS NOT NULL AND status!='published'
      AND generation_status IN ('failed','pending_manual')
  `).run(retryingA2e?"failed":"pending",retryingA2e?current.error:null,id);
  if(!reset.changes)return NextResponse.json({error:"Generation state changed; refresh and try again"},{status:409});

  startCampaignAutopilotLoop();
  const tick=await runCampaignAutopilotOnce({slotId:id});
  const post=db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id);
  return NextResponse.json({ok:true,processed:tick.processed,queued:tick.queued,post:rowToPost(post)},{status:202});
}
