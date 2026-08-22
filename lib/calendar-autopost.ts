import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";
import { publishWebsite } from "@/lib/site-publish";

const globalState=globalThis as unknown as { videoEngineCalendarAuto?:{timer?:ReturnType<typeof setInterval>;running:boolean} };
const state=globalState.videoEngineCalendarAuto??{running:false};
globalState.videoEngineCalendarAuto=state;

async function publishRow(post:any){
  if(post.network==="instagram"){
    if(!post.video_job_id&&!post.media_url) throw new Error("Auto-post requires generated media");
    return publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption});
  }
  if(post.network==="website"){
    if(!post.site_id) throw new Error("Website auto-post item has no Site");
    const blog=post.source_asset_key?.startsWith("blog:")?db.prepare("SELECT slug FROM blog_posts WHERE id=?").get(String(post.source_asset_key).slice(5)) as any:null;
    return publishWebsite({siteId:post.site_id,title:post.title,content:post.caption||"",slug:blog?.slug||null});
  }
  throw new Error(`${post.network} auto-post publisher is not connected`);
}

export async function runDueCalendarPosts(){
  if(state.running)return {processed:0}; state.running=true;
  let processed=0;
  try{
    const due=db.prepare("SELECT * FROM scheduled_posts WHERE auto_post=1 AND status='approved' AND scheduled_at<=? ORDER BY scheduled_at ASC LIMIT 20").all(new Date().toISOString()) as any[];
    for(const post of due){
      try{
        await publishRow(post);
        db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),post.id);
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(message.slice(0,2000),post.id);
      }
      processed++;
    }
    return {processed};
  }finally{state.running=false;}
}

export function startCalendarAutoPostLoop(){
  if(state.timer||process.env.NODE_ENV==="test")return;
  state.timer=setInterval(()=>{runDueCalendarPosts().catch(()=>{});},60_000);
  if(typeof state.timer.unref==="function")state.timer.unref();
}
