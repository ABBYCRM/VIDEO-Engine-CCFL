import crypto from "node:crypto";
import { db } from "@/lib/db";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";
import { generateImage } from "@/lib/nvidia/image";
import { saveGeneratedImage } from "@/lib/media-library";
import { ensureAssetCalendarPost } from "@/lib/calendar-assets";
import { getSite } from "@/lib/sites";
import { scoreSeoPost } from "@/lib/seo/score";

db.exec(`
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  outline_json TEXT NOT NULL DEFAULT '[]',
  image_prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_site ON blog_posts(site_id,scheduled_at);
`);

function ensureBlogColumn(name:string,ddl:string){try{const cols=db.prepare("PRAGMA table_info(blog_posts)").all() as {name:string}[];if(!cols.some(c=>c.name===name))db.exec(`ALTER TABLE blog_posts ADD COLUMN ${ddl}`);}catch{}}
ensureBlogColumn("body_markdown","body_markdown TEXT");
ensureBlogColumn("meta_title","meta_title TEXT");
ensureBlogColumn("meta_description","meta_description TEXT");
ensureBlogColumn("focus_keyword","focus_keyword TEXT");
ensureBlogColumn("image_url","image_url TEXT");
ensureBlogColumn("image_model","image_model TEXT");
ensureBlogColumn("generation_status","generation_status TEXT NOT NULL DEFAULT 'pending'");
ensureBlogColumn("generation_error","generation_error TEXT");
ensureBlogColumn("generation_started_at","generation_started_at TEXT");
ensureBlogColumn("generation_finished_at","generation_finished_at TEXT");
ensureBlogColumn("seo_score","seo_score INTEGER");
ensureBlogColumn("seo_score_max","seo_score_max INTEGER");
ensureBlogColumn("seo_checks_json","seo_checks_json TEXT");
ensureBlogColumn("geo_schema_json","geo_schema_json TEXT");
ensureBlogColumn("geo_faq_json","geo_faq_json TEXT");
ensureBlogColumn("geo_score","geo_score INTEGER");

type BlogDraft={title:string;slug:string;excerpt:string;outline:string[];imagePrompt:string};
export type BlogPostRecord={
  id:string;siteId:string;title:string;slug:string;excerpt:string;outline:string[];imagePrompt:string;status:string;scheduledAt:string|null;model:string|null;
  bodyMarkdown:string|null;metaTitle:string|null;metaDescription:string|null;focusKeyword:string|null;imageUrl:string|null;imageModel:string|null;
  generationStatus:string;generationError:string|null;
  seoScore:number|null;seoScoreMax:number|null;seoChecks:{id:string;label:string;pass:boolean;detail:string}[];
  geoSchema:Record<string,unknown>|null;geoFaq:{q:string;a:string}[];geoScore:number|null;
};

function plannedDays(horizon:number,cadence:string){const days:number[]=[];for(let i=1;i<=horizon;i++){const dow=new Date(Date.now()+i*86400000).getDay();if(cadence==="daily"||(cadence==="3-week"&&[1,3,5].includes(dow))||(cadence==="weekly"&&days.length===0))days.push(i);}return days;}
function cleanDraft(x:any,index:number):BlogDraft{return{title:String(x?.title||`Planned article ${index+1}`).slice(0,180),slug:String(x?.slug||`planned-article-${index+1}`).toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-|-$/g,"").slice(0,160),excerpt:String(x?.excerpt||"").slice(0,500),outline:Array.isArray(x?.outline)?x.outline.slice(0,12).map((v:any)=>String(v).slice(0,240)):[],imagePrompt:String(x?.imagePrompt||"").slice(0,1200)};}
function mapPost(row:any):BlogPostRecord{return{id:row.id,siteId:row.site_id,title:row.title,slug:row.slug,excerpt:row.excerpt,outline:JSON.parse(row.outline_json||"[]"),imagePrompt:row.image_prompt,status:row.status,scheduledAt:row.scheduled_at,model:row.model,bodyMarkdown:row.body_markdown,metaTitle:row.meta_title,metaDescription:row.meta_description,focusKeyword:row.focus_keyword,imageUrl:row.image_url,imageModel:row.image_model,generationStatus:row.generation_status||"pending",generationError:row.generation_error,seoScore:row.seo_score??null,seoScoreMax:row.seo_score_max??null,seoChecks:row.seo_checks_json?JSON.parse(row.seo_checks_json):[],geoSchema:row.geo_schema_json?JSON.parse(row.geo_schema_json):null,geoFaq:row.geo_faq_json?JSON.parse(row.geo_faq_json):[],geoScore:row.geo_score??null};}
export function getBlogPost(id:string){const row=db.prepare("SELECT * FROM blog_posts WHERE id=?").get(id) as any;return row?mapPost(row):null;}

async function siteSnapshot(url:string){
  try{
    const response=await fetch(url,{headers:{"user-agent":"VIDEO-Engine SEO Autopilot/1.0"},signal:AbortSignal.timeout(10000),cache:"no-store"});
    if(!response.ok)return{text:"",links:[] as string[]};
    const html=(await response.text()).slice(0,180000);
    const links=Array.from(html.matchAll(/href=["']([^"'#]+)["']/gi)).map(m=>m[1]).map(href=>{try{return new URL(href,url).toString()}catch{return""}}).filter(Boolean).filter((href,i,all)=>{try{return new URL(href).hostname===new URL(url).hostname&&all.indexOf(href)===i}catch{return false}}).slice(0,20);
    const text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim().slice(0,16000);
    return{text,links};
  }catch{return{text:"",links:[] as string[]};}
}

function targetWords(articleLength:string){if(articleLength==="short")return 800;if(articleLength==="medium")return 1400;if(articleLength==="pillar")return 3000;return 2000;}

export async function generateBlogPlan(siteId:string,horizonDays:number){
  const site=getSite(siteId);if(!site)throw new Error("Site not found");const horizon=[3,7,14,30].includes(horizonDays)?horizonDays:7,days=plannedDays(horizon,site.cadence);if(!days.length)return[];
  const model=getNvidiaModel();
  const phone = (site as any).phoneNumber ? (site as any).phoneNumber : "";
  const phoneBlock = phone ? (" Contact phone to feature in CTAs and contact sections: " + phone + ".") : "";
  const prompt = "Create exactly " + days.length + " blog draft briefs for " + site.url + ". Audience: " + (site.targetAudience || "site visitors") + "." + phoneBlock + " Brand voice: " + site.brandVoice + ". Topics: " + site.topicFocus + ". " + phoneBlock + " Seed keywords: " + site.keywords + ". Article length: " + site.articleLength + ". Image style: " + (site.imageEnabled ? site.imageStyle : "no image") + ". Image ratio: " + site.imageAspectRatio + ". CTA: " + site.cta + ". Internal linking: " + site.internalLinking + ". External authoritative sources: " + site.externalLinks + ". Output {\"posts\":[{\"title\":\"\",\"slug\":\"\",\"excerpt\":\"\",\"outline\":[\"\"],\"imagePrompt\":\"\"}]}. imagePrompt must honor the selected image style and contain no text overlays.";
  const response=await chatCompletion({model,jsonMode:true,temperature:0.65,maxTokens:Math.min(6000,1400+days.length*260),messages:[{role:"system",content:"You are an SEO editorial planner. Return only JSON. Create distinct, truthful blog draft briefs. Never invent statistics, case outcomes, awards, testimonials, laws, or facts. Titles should match search intent without clickbait."},{role:"user",content:prompt}]});
  let parsed:any;try{parsed=JSON.parse(response.text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,""));}catch{throw new Error("NVIDIA blog planner returned invalid JSON");}const drafts=(Array.isArray(parsed?.posts)?parsed.posts:[]).slice(0,days.length).map(cleanDraft);while(drafts.length<days.length)drafts.push(cleanDraft(null,drafts.length));
  const insert=db.prepare("INSERT INTO blog_posts(id,site_id,title,slug,excerpt,outline_json,image_prompt,status,scheduled_at,model,generation_status) VALUES(?,?,?,?,?,?,?,?,?,?,?)");const results:any[]=[];
  for(let i=0;i<days.length;i++){const id=crypto.randomUUID(),when=new Date(Date.now()+days[i]*86400000);when.setHours(10,0,0,0);const d=drafts[i];insert.run(id,siteId,d.title,d.slug,d.excerpt,JSON.stringify(d.outline),d.imagePrompt,"draft",when.toISOString(),model,"pending");results.push({id,...d,scheduledAt:when.toISOString(),model,generationStatus:"pending"});}
  return results;
}

export async function generateFullBlogPost(postId:string){
  const current=getBlogPost(postId);if(!current)throw new Error("Blog post not found");if(current.generationStatus==="ready"&&current.bodyMarkdown)return current;
  const site=getSite(current.siteId);if(!site)throw new Error("Site not found");
  db.prepare("UPDATE blog_posts SET generation_status='generating',generation_error=NULL,generation_started_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),postId);
  try{
    const snapshot=await siteSnapshot(site.url);const model=getNvidiaModel();const words=targetWords(site.articleLength);
    const response=await chatCompletion({model,jsonMode:true,temperature:0.55,maxTokens:Math.min(7600,Math.max(2600,Math.ceil(words*1.7))),messages:[
      {role:"system",content:"You are an expert SEO article writer. Return ONLY valid JSON. Write useful, original, human-readable long-form content. Do not fabricate statistics, legal rules, case results, testimonials, studies, quotations, awards, or URLs. Do not make guaranteed outcome claims. Use markdown headings and natural paragraphs. Never include markdown fences around the JSON."},
      {role:"user",content:[
        `Website: ${site.url}`,
        `Article title: ${current.title}`,
        `Slug: ${current.slug}`,
        `Excerpt: ${current.excerpt}`,
        `Outline: ${current.outline.join(" | ")}`,
        `Audience: ${site.targetAudience||"site visitors"}`,
        `Brand voice: ${site.brandVoice}`,
        `Topic focus: ${site.topicFocus}`,
        `Seed keywords: ${site.keywords}`,
        `Target length: approximately ${words} words`,
        `Default CTA: ${site.cta||"none"}`,
        `Internal links allowed: ${site.internalLinking?"yes":"no"}`,
        `Known internal URLs: ${snapshot.links.join(", ")||"none discovered"}`,
        `External links: ${site.externalLinks?"Only include an external URL if it is explicitly known from the supplied context; never invent a URL.":"do not include external links"}`,
        `Homepage/site context: ${snapshot.text||"not available"}`,
        `Return {"metaTitle":"<=60 chars","metaDescription":"140-160 chars","focusKeyword":"one primary search phrase","bodyMarkdown":"full article body without repeating the H1 title"}.`
      ].join("\n")}
    ]});
    let parsed:any;try{parsed=JSON.parse(response.text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,""));}catch{throw new Error("NVIDIA article writer returned invalid JSON");}
    const bodyMarkdown=String(parsed?.bodyMarkdown||"").trim();if(bodyMarkdown.length<500)throw new Error("NVIDIA article writer returned an incomplete article");
    const metaTitle=String(parsed?.metaTitle||current.title).slice(0,70),metaDescription=String(parsed?.metaDescription||current.excerpt).slice(0,180),focusKeyword=String(parsed?.focusKeyword||"").slice(0,180);
    let imageUrl:string|null=current.imageUrl,imageModel:string|null=current.imageModel;
    if(site.imageEnabled&&site.imageStyle!=="no image"&&current.imagePrompt){
      const image=await generateImage({prompt:`${current.imagePrompt}\nVisual style: ${site.imageStyle}. Professional editorial feature image for an SEO article. Photographically coherent when realism is requested. No text, captions, logos, watermarks, UI, or typography.`,aspectRatio:site.imageAspectRatio});
      const saved=await saveGeneratedImage({base64:image.base64,source:`seo-blog:${postId}`,model:image.model,prompt:current.imagePrompt,mimeType:image.mimeType});imageUrl=saved.url;imageModel=image.model;
    }
    const seo=scoreSeoPost({title:current.title,metaTitle,metaDescription,focusKeyword,bodyMarkdown,slug:current.slug});
    db.prepare(`UPDATE blog_posts SET body_markdown=?,meta_title=?,meta_description=?,focus_keyword=?,image_url=?,image_model=?,seo_score=?,seo_score_max=?,seo_checks_json=?,generation_status='ready',generation_error=NULL,generation_finished_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(bodyMarkdown,metaTitle,metaDescription,focusKeyword,imageUrl,imageModel,seo.score,seo.maxScore,JSON.stringify(seo.checks),new Date().toISOString(),postId);
    ensureAssetCalendarPost({sourceKey:`blog:${postId}`,title:current.title,contentType:"blog",network:"website",caption:current.excerpt,siteId:current.siteId,scheduledAt:current.scheduledAt?new Date(current.scheduledAt):undefined,mediaUrl:imageUrl,mediaType:imageUrl?"image/png":null,contentBody:bodyMarkdown,seoTitle:metaTitle,metaDescription,slug:current.slug,focusKeyword,generationStatus:"ready"});
    return getBlogPost(postId)!;
  }catch(e){const message=e instanceof Error?e.message:String(e);db.prepare("UPDATE blog_posts SET generation_status='failed',generation_error=?,generation_finished_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message,new Date().toISOString(),postId);db.prepare("UPDATE scheduled_posts SET generation_status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE source_asset_key=?").run(message,`blog:${postId}`);throw e;}
}
