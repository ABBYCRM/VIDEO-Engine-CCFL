import crypto from "node:crypto";
import { db } from "@/lib/db";

function ensureColumn(name:string, ddl:string){try{const cols=db.prepare("PRAGMA table_info(scheduled_posts)").all() as {name:string}[];if(!cols.some(c=>c.name===name))db.exec(`ALTER TABLE scheduled_posts ADD COLUMN ${ddl}`);}catch{}}
ensureColumn("content_type","content_type TEXT NOT NULL DEFAULT 'ugc'");
ensureColumn("media_url","media_url TEXT");
ensureColumn("media_type","media_type TEXT");
ensureColumn("source_asset_key","source_asset_key TEXT");
ensureColumn("site_id","site_id TEXT");
ensureColumn("campaign_id","campaign_id TEXT");
ensureColumn("planning_horizon_days","planning_horizon_days INTEGER");
ensureColumn("content_body","content_body TEXT");
ensureColumn("seo_title","seo_title TEXT");
ensureColumn("meta_description","meta_description TEXT");
ensureColumn("slug","slug TEXT");
ensureColumn("focus_keyword","focus_keyword TEXT");
ensureColumn("generation_status","generation_status TEXT NOT NULL DEFAULT 'ready'");
ensureColumn("upper_job_id","upper_job_id TEXT");
ensureColumn("lower_job_id","lower_job_id TEXT");
try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_posts_source_asset_key ON scheduled_posts(source_asset_key) WHERE source_asset_key IS NOT NULL");}catch{}

export function ensureAssetCalendarPost(input:{
  sourceKey:string;title:string;contentType:string;mediaUrl?:string|null;mediaType?:string|null;caption?:string;network?:string;
  videoJobId?:string|null;siteId?:string|null;campaignId?:string|null;scheduledAt?:Date;planningHorizonDays?:number|null;
  contentBody?:string|null;seoTitle?:string|null;metaDescription?:string|null;slug?:string|null;focusKeyword?:string|null;
  generationStatus?:"pending"|"generating"|"ready"|"failed"|string;
  approvalMode?:"manual"|"auto";
}){
  const existing=db.prepare("SELECT id FROM scheduled_posts WHERE source_asset_key=?").get(input.sourceKey) as {id:string}|undefined;
  if(existing){
    db.prepare(`UPDATE scheduled_posts SET title=?,caption=?,media_url=COALESCE(?,media_url),media_type=COALESCE(?,media_type),content_body=COALESCE(?,content_body),seo_title=COALESCE(?,seo_title),meta_description=COALESCE(?,meta_description),slug=COALESCE(?,slug),focus_keyword=COALESCE(?,focus_keyword),generation_status=COALESCE(?,generation_status),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
      input.title.slice(0,180),(input.caption||"").slice(0,5000),input.mediaUrl||null,input.mediaType||null,input.contentBody||null,input.seoTitle||null,input.metaDescription||null,input.slug||null,input.focusKeyword||null,input.generationStatus||null,existing.id
    );
    return existing.id;
  }
  const id=crypto.randomUUID(); const when=(input.scheduledAt||new Date(Date.now()+24*60*60*1000)).toISOString();
  const auto=input.approvalMode==="auto"?1:0;
  db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,video_job_id,media_url,media_type,source_asset_key,site_id,campaign_id,planning_horizon_days,content_body,seo_title,meta_description,slug,focus_keyword,generation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,input.title.slice(0,180),input.network||"instagram",when,input.approvalMode==="auto"?"approved":"pending",auto,(input.caption||"").slice(0,5000),input.contentType,input.videoJobId||null,input.mediaUrl||null,input.mediaType||null,input.sourceKey,input.siteId||null,input.campaignId||null,input.planningHorizonDays||null,input.contentBody||null,input.seoTitle||null,input.metaDescription||null,input.slug||null,input.focusKeyword||null,input.generationStatus||"ready"
  );
  return id;
}

export function createPlanningSlots(input:{horizonDays:number;titlePrefix:string;contentType:string;network?:string;caption?:string;campaignId?:string|null;siteId?:string|null;approvalMode?:"manual"|"auto";cadence?:"daily"|"3-week"|"weekly"|"manual";outputMode?:"video"|"image"|"auto_mix"}){
  const horizon=[3,7,14,30].includes(input.horizonDays)?input.horizonDays:7; const cadence=input.cadence||"daily"; const days:number[]=[];
  for(let i=1;i<=horizon;i++){const dow=new Date(Date.now()+i*86400000).getDay();if(cadence==="daily"||(cadence==="3-week"&&[1,3,5].includes(dow))||(cadence==="weekly"&&i===1))days.push(i);}
  const outputMode=input.outputMode||"video";
  const ids:string[]=[]; for(let index=0;index<days.length;index++){const day=days[index],id=crypto.randomUUID(),when=new Date(Date.now()+day*86400000);when.setHours(10,0,0,0);const slotType=outputMode==="image"?"image":outputMode==="auto_mix"?(index%2===0?input.contentType:"image"):input.contentType;db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,site_id,campaign_id,planning_horizon_days,generation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,`${input.titlePrefix} · Day ${day} · ${slotType==="image"?"Still":"Video"}`.slice(0,180),input.network||"instagram",when.toISOString(),input.approvalMode==="auto"?"approved":"pending",input.approvalMode==="auto"?1:0,(input.caption||"").slice(0,5000),slotType,input.siteId||null,input.campaignId||null,horizon,"pending");ids.push(id);}
  return ids;
}
