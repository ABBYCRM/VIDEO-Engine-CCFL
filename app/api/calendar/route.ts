import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureBrandContactInCaption } from "@/lib/brand-contact";
import "@/lib/calendar-assets";
import { startCalendarPublisherLoop } from "@/lib/calendar-publisher";
startCalendarPublisherLoop();
const NETWORKS=new Set(["instagram","facebook","youtube","tiktok","linkedin","website"]),STATUSES=new Set(["draft","pending","approved","published","failed"]),FORMATS=new Set(["podcast","ugc","newsroom","direct","cinematic","image","blog"]);
function rowToPost(row:any){return{id:row.id,title:row.title,network:row.network,scheduledAt:row.scheduled_at,status:row.status,autoPost:Boolean(row.auto_post),caption:row.caption,contentType:row.content_type||"ugc",videoJobId:row.video_job_id,upperJobId:row.upper_job_id,lowerJobId:row.lower_job_id,mediaUrl:row.media_url,mediaType:row.media_type,sourceAssetKey:row.source_asset_key,siteId:row.site_id,campaignId:row.campaign_id,planningHorizonDays:row.planning_horizon_days,contentBody:row.content_body,seoTitle:row.seo_title,metaDescription:row.meta_description,slug:row.slug,focusKeyword:row.focus_keyword,generationStatus:row.generation_status||"ready",connectedAccountId:row.connected_account_id,publishedAt:row.published_at,verifiedAt:row.verified_at,instagramPermalink:row.instagram_permalink,verificationError:row.verification_error,error:row.error,createdAt:row.created_at,updatedAt:row.updated_at};}
export async function GET(){if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({posts:(db.prepare("SELECT * FROM scheduled_posts ORDER BY scheduled_at ASC").all() as any[]).map(rowToPost)});}
export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>({})),title=String(body.title||"").trim().slice(0,180),network=String(body.network||"instagram").toLowerCase(),status=String(body.status||"pending"),contentType=String(body.contentType||"ugc").toLowerCase(),scheduledAt=String(body.scheduledAt||"");
  if(!title)return NextResponse.json({error:"Title is required"},{status:400});if(!NETWORKS.has(network)||!STATUSES.has(status)||!FORMATS.has(contentType))return NextResponse.json({error:"Invalid calendar fields"},{status:400});const when=new Date(scheduledAt);if(!scheduledAt||Number.isNaN(when.getTime()))return NextResponse.json({error:"Valid scheduledAt is required"},{status:400});
  const id=crypto.randomUUID();
  db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,video_job_id,connected_account_id,media_url,media_type,source_asset_key,site_id,campaign_id,planning_horizon_days,content_body,seo_title,meta_description,slug,focus_keyword,generation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,title,network,when.toISOString(),status,body.autoPost?1:0,ensureBrandContactInCaption(String(body.caption||"")).slice(0,5000),contentType,body.videoJobId?String(body.videoJobId):null,body.connectedAccountId?String(body.connectedAccountId):null,body.mediaUrl?String(body.mediaUrl):null,body.mediaType?String(body.mediaType):null,body.sourceAssetKey?String(body.sourceAssetKey):null,body.siteId?String(body.siteId):null,body.campaignId?String(body.campaignId):null,body.planningHorizonDays?Number(body.planningHorizonDays):null,body.contentBody?String(body.contentBody):null,body.seoTitle?String(body.seoTitle).slice(0,180):null,body.metaDescription?String(body.metaDescription).slice(0,300):null,body.slug?String(body.slug).slice(0,180):null,body.focusKeyword?String(body.focusKeyword).slice(0,180):null,String(body.generationStatus||"ready")
  );
  return NextResponse.json({post:rowToPost(db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id))},{status:201});
}
