import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";

let started=false;
let running=false;

async function publishRow(post:any){
  if(post.network==="instagram"){
    if(!post.video_job_id&&!post.media_url)throw new Error("Auto-post requires generated media");
    return publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption});
  }
  if(post.network==="website"){
    if(!post.site_id)throw new Error("Website auto-post item has no Site");
    if(post.generation_status&&post.generation_status!=="ready")throw new Error(`Website draft is ${post.generation_status}; it is not ready to publish`);
    return publishWebsite({siteId:post.site_id,title:post.title,content:post.content_body||post.caption||"",slug:post.slug||null});
  }
  throw new Error(`${post.network} auto-post publisher is not connected`);
}

export async function runCalendarPublisherOnce(){
  if(running)return{processed:0};running=true;let processed=0;
  try{
    const rows=db.prepare("SELECT * FROM scheduled_posts WHERE auto_post=1 AND status='approved' AND scheduled_at<=? ORDER BY scheduled_at ASC LIMIT 10").all(new Date().toISOString()) as any[];
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
