import crypto from "node:crypto";
import { db } from "@/lib/db";
import { chatCompletion, getNvidiaModel } from "@/lib/nvidia/client";
import { getSite } from "@/lib/sites";

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

type BlogDraft={title:string;slug:string;excerpt:string;outline:string[];imagePrompt:string};
function plannedDays(horizon:number,cadence:string){const days:number[]=[];for(let i=1;i<=horizon;i++){const dow=new Date(Date.now()+i*86400000).getDay();if(cadence==="daily"||(cadence==="3-week"&&[1,3,5].includes(dow))||(cadence==="weekly"&&days.length===0))days.push(i);}return days;}
function cleanDraft(x:any,index:number):BlogDraft{return{title:String(x?.title||`Planned article ${index+1}`).slice(0,180),slug:String(x?.slug||`planned-article-${index+1}`).toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-|-$/g,"").slice(0,160),excerpt:String(x?.excerpt||"").slice(0,500),outline:Array.isArray(x?.outline)?x.outline.slice(0,12).map((v:any)=>String(v).slice(0,240)):[],imagePrompt:String(x?.imagePrompt||"").slice(0,1200)};}
export async function generateBlogPlan(siteId:string,horizonDays:number){
  const site=getSite(siteId);if(!site)throw new Error("Site not found");const horizon=[3,7,14,30].includes(horizonDays)?horizonDays:7,days=plannedDays(horizon,site.cadence);if(!days.length)return[];
  const model=getNvidiaModel();const response=await chatCompletion({model,jsonMode:true,temperature:0.65,maxTokens:Math.min(6000,1400+days.length*260),messages:[{role:"system",content:"You are an SEO editorial planner. Return only JSON. Create distinct, truthful blog draft briefs. Never invent statistics, case outcomes, awards, testimonials, laws, or facts. Titles should match search intent without clickbait."},{role:"user",content:`Create exactly ${days.length} blog draft briefs for ${site.url}. Audience: ${site.targetAudience||"site visitors"}. Brand voice: ${site.brandVoice}. Topics: ${site.topicFocus}. Seed keywords: ${site.keywords}. Article length: ${site.articleLength}. Image style: ${site.imageEnabled?site.imageStyle:"no image"}. Image ratio: ${site.imageAspectRatio}. CTA: ${site.cta}. Internal linking: ${site.internalLinking}. External authoritative sources: ${site.externalLinks}. Output {"posts":[{"title":"","slug":"","excerpt":"","outline":[""],"imagePrompt":""}]}. imagePrompt must honor the selected image style and contain no text overlays.`}]});
  let parsed:any;try{parsed=JSON.parse(response.text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,""));}catch{throw new Error("NVIDIA blog planner returned invalid JSON");}const drafts=(Array.isArray(parsed?.posts)?parsed.posts:[]).slice(0,days.length).map(cleanDraft);while(drafts.length<days.length)drafts.push(cleanDraft(null,drafts.length));
  const insert=db.prepare("INSERT INTO blog_posts(id,site_id,title,slug,excerpt,outline_json,image_prompt,status,scheduled_at,model) VALUES(?,?,?,?,?,?,?,?,?,?)");const results:any[]=[];
  for(let i=0;i<days.length;i++){const id=crypto.randomUUID(),when=new Date(Date.now()+days[i]*86400000);when.setHours(10,0,0,0);const d=drafts[i];insert.run(id,siteId,d.title,d.slug,d.excerpt,JSON.stringify(d.outline),d.imagePrompt,"draft",when.toISOString(),model);results.push({id,...d,scheduledAt:when.toISOString(),model});}
  return results;
}
