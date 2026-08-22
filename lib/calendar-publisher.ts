import { db } from "@/lib/db";
import { publishInstagram } from "@/lib/instagram-publish";

let started=false;
async function tick(){
  const rows=db.prepare("SELECT * FROM scheduled_posts WHERE auto_post=1 AND status='approved' AND scheduled_at<=? ORDER BY scheduled_at ASC LIMIT 5").all(new Date().toISOString()) as any[];
  for(const post of rows){
    if(post.network!=="instagram"||(!post.video_job_id&&!post.media_url))continue;
    try{await publishInstagram({jobId:post.video_job_id,mediaUrl:post.media_url,mediaType:post.media_type,caption:post.caption});db.prepare("UPDATE scheduled_posts SET status='published',published_at=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(new Date().toISOString(),post.id);}
    catch(e){db.prepare("UPDATE scheduled_posts SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(e instanceof Error?e.message:String(e),post.id);}
  }
}
export function startCalendarPublisherLoop(){if(started||process.env.NODE_ENV==="test")return;started=true;setInterval(()=>{void tick();},60_000).unref?.();setTimeout(()=>{void tick();},5_000).unref?.();}
