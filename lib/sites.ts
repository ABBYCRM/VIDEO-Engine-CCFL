import crypto from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

db.exec(`
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  cms TEXT NOT NULL DEFAULT 'custom',
  language TEXT NOT NULL DEFAULT 'en',
  target_audience TEXT NOT NULL DEFAULT '',
  brand_voice TEXT NOT NULL DEFAULT '',
  topic_focus TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  article_length TEXT NOT NULL DEFAULT 'long',
  cadence TEXT NOT NULL DEFAULT 'daily',
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  image_enabled INTEGER NOT NULL DEFAULT 1,
  image_style TEXT NOT NULL DEFAULT 'hyper-realistic',
  image_aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  internal_linking INTEGER NOT NULL DEFAULT 1,
  external_links INTEGER NOT NULL DEFAULT 1,
  cta TEXT NOT NULL DEFAULT '',
  bridge_token_hash TEXT NOT NULL,
  bridge_token_encrypted TEXT NOT NULL,
  publish_mode TEXT NOT NULL DEFAULT 'unconfigured',
  publish_endpoint TEXT,
  publish_username TEXT,
  publish_secret_encrypted TEXT,
  verified_at TEXT,
  last_seen_at TEXT,
  status TEXT NOT NULL DEFAULT 'setup',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
`);

function ensureColumn(name:string, ddl:string){
  try{
    const cols=db.prepare("PRAGMA table_info(sites)").all() as {name:string}[];
    if(!cols.some(c=>c.name===name)) db.exec(`ALTER TABLE sites ADD COLUMN ${ddl}`);
  }catch{}
}
ensureColumn("publish_mode","publish_mode TEXT NOT NULL DEFAULT 'unconfigured'");
ensureColumn("publish_endpoint","publish_endpoint TEXT");
ensureColumn("publish_username","publish_username TEXT");
ensureColumn("publish_secret_encrypted","publish_secret_encrypted TEXT");

export type Site = {
  id:string; name:string; url:string; cms:string; language:string; targetAudience:string; brandVoice:string;
  topicFocus:string; keywords:string; articleLength:string; cadence:string; approvalMode:string; imageEnabled:boolean;
  imageStyle:string; imageAspectRatio:string; internalLinking:boolean; externalLinks:boolean; cta:string; phoneNumber:string|null;
  publishMode:string; publishEndpoint:string|null; publishUsername:string|null; publishConfigured:boolean;
  verifiedAt:string|null; lastSeenAt:string|null; status:string; createdAt:string; updatedAt:string; bridgeToken?:string;
};

function map(row:any):Site {
  return {
    id:row.id,name:row.name,url:row.url,cms:row.cms,language:row.language,targetAudience:row.target_audience,
    brandVoice:row.brand_voice,topicFocus:row.topic_focus,keywords:row.keywords,articleLength:row.article_length,
    cadence:row.cadence,approvalMode:row.approval_mode,imageEnabled:Boolean(row.image_enabled),imageStyle:row.image_style,
    imageAspectRatio:row.image_aspect_ratio,internalLinking:Boolean(row.internal_linking),externalLinks:Boolean(row.external_links),cta:row.cta,phoneNumber:row.phone_number||null,
    publishMode:row.publish_mode||"unconfigured",publishEndpoint:row.publish_endpoint||null,publishUsername:row.publish_username||null,
    publishConfigured:Boolean(row.publish_endpoint&&row.publish_secret_encrypted),verifiedAt:row.verified_at,lastSeenAt:row.last_seen_at,
    status:row.status,createdAt:row.created_at,updatedAt:row.updated_at
  };
}

export function listSites(){ return (db.prepare("SELECT * FROM sites ORDER BY created_at DESC").all() as any[]).map(map); }
export function getSite(id:string){ const row=db.prepare("SELECT * FROM sites WHERE id=?").get(id) as any; return row?map(row):null; }
export function getSiteWithToken(id:string){ const row=db.prepare("SELECT * FROM sites WHERE id=?").get(id) as any; if(!row)return null; return {...map(row),bridgeToken:decryptSecret(row.bridge_token_encrypted)}; }
export function getSitePublishingSecret(id:string){
  const row=db.prepare("SELECT publish_secret_encrypted FROM sites WHERE id=?").get(id) as {publish_secret_encrypted:string|null}|undefined;
  return row?.publish_secret_encrypted?decryptSecret(row.publish_secret_encrypted):null;
}

export function createSite(input:any){
  const id=crypto.randomUUID();
  const token=`ve_site_${crypto.randomBytes(24).toString("base64url")}`;
  const url=new URL(String(input.url||"").trim());
  if(!["http:","https:"].includes(url.protocol)) throw new Error("Website URL must use http or https");
  const cleanUrl=`${url.protocol}//${url.host}`;
  const publishSecret=String(input.publishSecret||"").trim();
  db.prepare(`INSERT INTO sites(id,name,url,cms,language,target_audience,brand_voice,topic_focus,keywords,article_length,cadence,approval_mode,image_enabled,image_style,image_aspect_ratio,internal_linking,external_links,cta,bridge_token_hash,bridge_token_encrypted,publish_mode,publish_endpoint,publish_username,publish_secret_encrypted,phone_number) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id,String(input.name||url.hostname).trim().slice(0,120),cleanUrl,String(input.cms||"custom"),String(input.language||"en").slice(0,20),
    String(input.targetAudience||"").slice(0,2000),String(input.brandVoice||"").slice(0,3000),String(input.topicFocus||"").slice(0,3000),
    String(input.keywords||"").slice(0,3000),String(input.articleLength||"long"),String(input.cadence||"daily"),String(input.approvalMode||"manual"),
    input.imageEnabled===false?0:1,String(input.imageStyle||"hyper-realistic"),String(input.imageAspectRatio||"16:9"),input.internalLinking===false?0:1,
    input.externalLinks===false?0:1,String(input.cta||"").slice(0,2000),crypto.createHash("sha256").update(token).digest("hex"),encryptSecret(token),
    String(input.publishMode||"unconfigured"),input.publishEndpoint?String(input.publishEndpoint).trim().slice(0,1000):null,
    input.publishUsername?String(input.publishUsername).trim().slice(0,300):null,publishSecret?encryptSecret(publishSecret):null,input.phoneNumber?String(input.phoneNumber).trim().slice(0,40):null
  );
  return {...getSite(id)!,bridgeToken:token};
}

export function updateSite(id:string,input:any){
  const allowed:Record<string,string>={
    name:"name",cms:"cms",language:"language",targetAudience:"target_audience",brandVoice:"brand_voice",topicFocus:"topic_focus",
    keywords:"keywords",articleLength:"article_length",cadence:"cadence",approvalMode:"approval_mode",imageEnabled:"image_enabled",imageStyle:"image_style",
    imageAspectRatio:"image_aspect_ratio",internalLinking:"internal_linking",externalLinks:"external_links",cta:"cta",status:"status",
    publishMode:"publish_mode",publishEndpoint:"publish_endpoint",publishUsername:"publish_username"
  };
  const entries=Object.entries(input).filter(([k])=>allowed[k]);
  const sets:string[]=[]; const values:any[]=[];
  for(const [k,v] of entries){sets.push(`${allowed[k]}=?`);values.push(["imageEnabled","internalLinking","externalLinks"].includes(k)?(v?1:0):String(v??""));}
  if(Object.prototype.hasOwnProperty.call(input,"publishSecret")&&String(input.publishSecret||"").trim()){
    sets.push("publish_secret_encrypted=?"); values.push(encryptSecret(String(input.publishSecret).trim()));
  }
  if(!sets.length)return getSite(id);
  values.push(new Date().toISOString(),id);
  db.prepare(`UPDATE sites SET ${sets.join(",")},updated_at=? WHERE id=?`).run(...values);
  return getSite(id);
}
export function deleteSite(id:string){ return db.prepare("DELETE FROM sites WHERE id=?").run(id).changes>0; }
export function markBridgeSeen(token:string,referer:string|null){
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const row=db.prepare("SELECT id,url FROM sites WHERE bridge_token_hash=?").get(hash) as {id:string;url:string}|undefined;if(!row)return false;
  let verified=false;try{verified=Boolean(referer&&new URL(referer).hostname===new URL(row.url).hostname);}catch{}
  const now=new Date().toISOString();
  db.prepare(`UPDATE sites SET last_seen_at=?, verified_at=CASE WHEN ?=1 THEN COALESCE(verified_at,?) ELSE verified_at END, status=CASE WHEN ?=1 THEN 'active' ELSE status END, updated_at=? WHERE id=?`).run(now,verified?1:0,now,verified?1:0,now,row.id);
  return true;
}
ensureColumn("phone_number","phone_number TEXT");
