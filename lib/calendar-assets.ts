import crypto from "node:crypto";
import { db } from "@/lib/db";
import { ensureBrandContactInCaption } from "@/lib/brand-contact";
import { pickSplitTemplateForCategory } from "@/lib/split-templates";
import { pickRandomStillPostTemplate } from "@/lib/still-post-templates";

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
ensureColumn("category","category TEXT");
ensureColumn("instagram_reel_id","instagram_reel_id TEXT");
ensureColumn("instagram_story_id","instagram_story_id TEXT");
ensureColumn("publishing_at","publishing_at TEXT");
ensureColumn("verified_at","verified_at TEXT");
ensureColumn("verification_error","verification_error TEXT");
ensureColumn("instagram_permalink","instagram_permalink TEXT");
ensureColumn("still_template_id","still_template_id TEXT");
ensureColumn("split_template","split_template TEXT");
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

// ---- Brand-timezone scheduling -------------------------------------------
// All calendar slots are anchored to Florida wall time (America/New_York),
// DST-aware, regardless of the server's own timezone.
const BRAND_TZ="America/New_York";
function brandTzOffsetMs(date:Date){const dtf=new Intl.DateTimeFormat("en-US",{timeZone:BRAND_TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});const p:Record<string,string>={};for(const part of dtf.formatToParts(date))p[part.type]=part.value;const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,(+p.hour)%24,+p.minute,+p.second);return asUTC-date.getTime();}
export function brandLocalTimeToUTC(dayOffset:number,hour:number,minute:number){const base=new Date(Date.now()+dayOffset*86400000);const dtf=new Intl.DateTimeFormat("en-CA",{timeZone:BRAND_TZ,year:"numeric",month:"2-digit",day:"2-digit"});const [y,m,d]=dtf.format(base).split("-").map(Number);const guess=new Date(Date.UTC(y,m-1,d,hour,minute,0));return new Date(guess.getTime()-brandTzOffsetMs(guess));}
// The daily posting waves in Florida wall time. Each wave fires one full
// trio per campaign: 1 still feed post + 1 reel + 1 story (a video slot
// publishes as a Reel + Story pair). Edit this list to change the cadence
// for every future plan.
export const DAILY_WAVES:ReadonlyArray<readonly [number,number]>=[[7,30],[17,0]];

export function createPlanningSlots(input:{horizonDays:number;titlePrefix:string;contentType:string;network?:string;caption?:string;campaignId?:string|null;siteId?:string|null;approvalMode?:"manual"|"auto";cadence?:"daily"|"3-week"|"weekly"|"manual";outputMode?:"video"|"image"|"auto_mix";categories?:string[];includeDailyStillPost?:boolean}){
  const horizon=[3,7,14,30,60].includes(input.horizonDays)?input.horizonDays:7; const cadence=input.cadence||"daily"; const days:number[]=[];
  for(let i=1;i<=horizon;i++){const dow=new Date(Date.now()+i*86400000).getDay();if(cadence==="daily"||(cadence==="3-week"&&[1,3,5].includes(dow))||(cadence==="weekly"&&i===1))days.push(i);}
  const outputMode=input.outputMode||"video";
  const categories=(input.categories||[]).filter(Boolean);
  const ids:string[]=[];
  // Trio campaigns share the two daily waves round-robin so Instagram gets exactly
  // ONE trio (1 still feed post + 1 reel + 1 story) per wave, not one per campaign.
  const isTrio=input.contentType==="podcast"&&input.includeDailyStillPost;
  let rotationCount=1,rotationIndex=0;
  if(isTrio&&input.campaignId){
    const active=db.prepare("SELECT id FROM campaigns WHERE status='active' ORDER BY created_at ASC, id ASC").all() as Array<{id:string}>;
    const list=active.some(c=>c.id===input.campaignId)?active:[...active,{id:input.campaignId}];
    rotationCount=Math.max(1,list.length);
    rotationIndex=Math.max(0,list.findIndex(c=>c.id===input.campaignId));
  }
  const campaignCategory=input.campaignId?String((db.prepare("SELECT category FROM campaigns WHERE id=?").get(input.campaignId) as {category?:string}|undefined)?.category||""):"";
  for(let index=0;index<days.length;index++){
    const day=days[index];
    const category=categories.length?categories[index%categories.length]:null;
    // Trio campaigns (video + still) fire every wave; everything else fires once, on the first wave.
    const waves=isTrio?DAILY_WAVES:DAILY_WAVES.slice(0,1);
    for(let w=0;w<waves.length;w++){
      // Round-robin: this campaign only owns waves where the global wave index matches its slot.
      if(isTrio&&rotationCount>1&&(((day-1)*DAILY_WAVES.length+w)%rotationCount)!==rotationIndex)continue;
      const [hh,mm]=waves[w];
      const when=brandLocalTimeToUTC(day,hh,mm);
      const waveTag=waves.length>1?(w===0?" · AM":" · PM"):"";
      const slotType=outputMode==="image"?"image":outputMode==="auto_mix"?(index%2===0?input.contentType:"image"):input.contentType;
      const seedCaption=input.contentType==="podcast"?"":(input.caption||"");
      const splitTemplate=slotType==="podcast"?pickSplitTemplateForCategory(category||campaignCategory||"car_accident").id:null;
      const id=crypto.randomUUID();
      db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,site_id,campaign_id,planning_horizon_days,generation_status,category,split_template) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,`${input.titlePrefix} · Day ${day}${waveTag} · ${slotType==="image"?"Still":"Video"}`.slice(0,180),input.network||"instagram",when.toISOString(),input.approvalMode==="auto"?"approved":"pending",input.approvalMode==="auto"?1:0,seedCaption.slice(0,5000),slotType,input.siteId||null,input.campaignId||null,horizon,"pending",category,splitTemplate);
      ids.push(id);
      if(input.includeDailyStillPost&&slotType!=="image"){
        const stillId=crypto.randomUUID();
        const stillTemplate=pickRandomStillPostTemplate();
        db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,content_type,site_id,campaign_id,planning_horizon_days,generation_status,category,still_template_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(stillId,`${input.titlePrefix} · Day ${day}${waveTag} · Still`.slice(0,180),input.network||"instagram",when.toISOString(),input.approvalMode==="auto"?"approved":"pending",input.approvalMode==="auto"?1:0,ensureBrandContactInCaption(input.caption||"").slice(0,5000),"image",input.siteId||null,input.campaignId||null,horizon,"pending",category,stillTemplate.id);
        ids.push(stillId);
      }
    }
  }
  return ids;
}
