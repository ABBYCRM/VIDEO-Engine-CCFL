import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";
import { publicCaptionForSlot, isOperatorCopy } from "@/lib/public-copy";

let started=false;
let running=false;

async function publishRow(post:any){
  if(post.network==="instagram"){
    if(post.generation_status&&post.generation_status!=="ready")throw new Error(`Media is ${post.generation_status}; it is not ready to publish`);
    if(!post.video_job_id&&!post.media_url)throw new Error("Auto-post requires generated media");
    const reel = await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption,postType:"feed"});
    const story = await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption,postType:"story"});
    return { reel, story };
  }
  if(post.network==="website"){
    if(!post.site_id)throw new Error("Website auto-post item has no Site");
    if(post.generation_status&&post.generation_status!=="ready")throw new Error(`Website draft is ${post.generation_status}; it is not ready to publish`);
    if(!String(post.content_body||"").trim())throw new Error("Website article body is empty");
    return publishWebsite({siteId:post.site_id,title:post.title,content:post.content_body,slug:post.slug||null,excerpt:(isOperatorCopy(post.caption||"")?publicCaptionForSlot({category:post.category||"car_accident",title:post.title}).caption:post.caption),metaTitle:post.seo_title||null,metaDescription:post.meta_description||null,focusKeyword:post.focus_keyword||null,featuredImageUrl:post.media_url||null});
  }
  throw new Error(`${post.network} auto-post publisher is not connected`);
}

export async function runCalendarPublisherOnce(){
  if(running)return{processed:0};running=true;let processed=0;
  try{
    const rows=db.prepare("SELECT * FROM scheduled_posts WHERE auto_post=1 AND status='approved' AND scheduled_at<=? AND (generation_status IS NULL OR generation_status='ready') ORDER BY scheduled_at ASC LIMIT 10").all(new Date().toISOString()) as any[];
    for(const post of rows){
      try{await publishRow(post);db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),post.id);}
      catch(e){db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run((e instanceof Error?e.message:String(e)).slice(0,2000),post.id);}
      processed++;
    }
    return{processed};
  }finally{running=false;}
}

export function startCalendarPublisherLoop(){
  if(started||process.env.NODE_ENV==="test")return;started=true;
  setInterval(()=>{void runCalendarPublisherOnce();},60_000).unref?.();
  setTimeout(()=>{void runCalendarPublisherOnce();},5_000).unref?.();
}
