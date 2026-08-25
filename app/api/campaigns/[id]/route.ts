import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureSplitSurfaceColumns, parseSplitSurface } from "@/lib/split-surface";
import { ensureUpperVideoColumns, parseUpperVideoIds, resolveCampaignAvatarId } from "@/lib/upper-videos";

ensureSplitSurfaceColumns();
ensureUpperVideoColumns();

const CAMPAIGN_SELECT=`id,name,category,website,mission,tone,platform,target_audience as targetAudience,avatar_id as avatarId,background_id as backgroundId,planning_horizon_days as planningHorizonDays,content_type as contentType,output_mode as outputMode,video_provider as videoProvider,video_model as videoModel,upper_provider as upperProvider,upper_model as upperModel,split_percent as splitPercent,split_relationship as splitRelationship,split_template as splitTemplate,split_duration_seconds as splitDurationSeconds,upper_video_ids as upperVideoIds,status,created_at as createdAt,updated_at as updatedAt`;

function shape(campaign:any){
  if(!campaign)return campaign;
  return {...campaign,upperVideoIds:parseUpperVideoIds(campaign.upperVideoIds)};
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const campaign=db.prepare(`SELECT ${CAMPAIGN_SELECT} FROM campaigns WHERE id=?`).get(id);
  if(!campaign)return NextResponse.json({error:"Not found"},{status:404});
  return NextResponse.json({campaign:shape(campaign)});
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const current=db.prepare("SELECT * FROM campaigns WHERE id=?").get(id) as any;
  if(!current)return NextResponse.json({error:"Not found"},{status:404});
  const body=await req.json().catch(()=>({}));
  const surface=parseSplitSurface({
    videoProvider:body.videoProvider===undefined?current.video_provider:body.videoProvider,
    videoModel:body.videoModel===undefined?current.video_model:body.videoModel,
    upperProvider:body.upperProvider===undefined?current.upper_provider:body.upperProvider,
    upperModel:body.upperModel===undefined?current.upper_model:body.upperModel,
    splitPercent:body.splitPercent===undefined?current.split_percent:body.splitPercent,
    splitRelationship:body.splitRelationship===undefined?current.split_relationship:body.splitRelationship,
    splitTemplate:body.splitTemplate===undefined?current.split_template:body.splitTemplate,
    splitDurationSeconds:body.splitDurationSeconds===undefined?current.split_duration_seconds:body.splitDurationSeconds
  }, current.video_provider||"grok");
  const mission=body.mission===undefined?current.mission:String(body.mission||"").slice(0,4000);
  const name=body.name===undefined?current.name:String(body.name||"").trim().slice(0,180);
  const avatarId=body.avatarId===undefined?current.avatar_id:resolveCampaignAvatarId(String(body.avatarId||"").trim());
  const upperVideoIds=body.upperVideoIds===undefined?parseUpperVideoIds(current.upper_video_ids):parseUpperVideoIds(body.upperVideoIds);
  if(!name)return NextResponse.json({error:"Campaign name is required"},{status:400});
  db.prepare(`UPDATE campaigns SET name=?,mission=?,avatar_id=?,video_provider=?,video_model=?,upper_provider=?,upper_model=?,split_percent=?,split_relationship=?,split_template=?,split_duration_seconds=?,upper_video_ids=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    name,mission,avatarId||null,surface.videoProvider,surface.videoModel,surface.upperProvider,surface.upperModel,surface.splitPercent,surface.splitRelationship,surface.splitTemplate,surface.splitDurationSeconds,upperVideoIds.length?JSON.stringify(upperVideoIds):null,id
  );
  return NextResponse.json({campaign:shape(db.prepare(`SELECT ${CAMPAIGN_SELECT} FROM campaigns WHERE id=?`).get(id))});
}
