import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPlanningSlots } from "@/lib/calendar-assets";

function ensureColumn(name:string,ddl:string){try{const cols=db.prepare("PRAGMA table_info(campaigns)").all() as {name:string}[];if(!cols.some(c=>c.name===name))db.exec(`ALTER TABLE campaigns ADD COLUMN ${ddl}`)}catch{}}
ensureColumn("planning_horizon_days","planning_horizon_days INTEGER NOT NULL DEFAULT 7");
ensureColumn("content_type","content_type TEXT NOT NULL DEFAULT 'cinematic'");

const CONTENT_TYPES=new Set(["podcast","ugc","newsroom","direct","cinematic"]);
export async function GET(){if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});const campaigns=db.prepare(`SELECT id,name,category,website,mission,tone,platform,target_audience as targetAudience,avatar_id as avatarId,background_id as backgroundId,planning_horizon_days as planningHorizonDays,content_type as contentType,status,created_at as createdAt,updated_at as updatedAt FROM campaigns ORDER BY created_at DESC`).all();return NextResponse.json({campaigns})}

export async function POST(req:Request){
  if(!(await requireAdmin()))return NextResponse.json({error:"Unauthorized"},{status:401});const body=await req.json().catch(()=>({}));
  const name=String(body.name||"").trim().slice(0,180),category=String(body.category||"").trim().slice(0,80),website=String(body.website||"").trim().slice(0,500),mission=String(body.mission||"").trim().slice(0,4000),tone=String(body.tone||"").trim().slice(0,200),platform=String(body.platform||"instagram").trim().slice(0,80),avatarId=String(body.avatarId||"").trim().slice(0,120),backgroundId=String(body.backgroundId||"").trim().slice(0,120),horizon=Number(body.planningHorizonDays||7),contentType=CONTENT_TYPES.has(String(body.contentType))?String(body.contentType):"cinematic";
  if(!name||!category||!mission)return NextResponse.json({error:"Campaign name, category, and AI plan are required"},{status:400});if(![3,7,14,30].includes(horizon))return NextResponse.json({error:"Planning horizon must be 3, 7, 14, or 30 days"},{status:400});
  const id=crypto.randomUUID();db.prepare(`INSERT INTO campaigns(id,name,category,website,mission,tone,platform,avatar_id,background_id,planning_horizon_days,content_type,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft')`).run(id,name,category,website||null,mission,tone||null,platform||null,avatarId||null,backgroundId||null,horizon,contentType);
  const calendarIds=createPlanningSlots({horizonDays:horizon,titlePrefix:name,contentType,network:platform||"instagram",caption:mission,campaignId:id,approvalMode:body.autoPost?"auto":"manual",cadence:"daily"});
  const campaign=db.prepare(`SELECT id,name,category,website,mission,tone,platform,avatar_id as avatarId,background_id as backgroundId,planning_horizon_days as planningHorizonDays,content_type as contentType,status,created_at as createdAt FROM campaigns WHERE id=?`).get(id);
  return NextResponse.json({campaign,calendarCount:calendarIds.length},{status:201});
}
