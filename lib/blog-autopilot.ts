import { db } from "@/lib/db";
import { generateFullBlogPost } from "@/lib/nvidia/blog-writer";

let started=false;
let running=false;

async function tick(){
  if(running)return;
  running=true;
  // The initial SELECT lives inside this try too, not before it: tick() is
  // invoked fire-and-forget (`void tick()`), and since Node 15 an unhandled
  // promise rejection crashes the whole process by default. A transient
  // SQLite error on that SELECT (SQLITE_BUSY from one of the several other
  // background loops writing concurrently, say) would otherwise take down
  // the entire server instead of just skipping this one tick.
  try{
    const next=db.prepare("SELECT id FROM blog_posts WHERE generation_status='pending' ORDER BY scheduled_at ASC, created_at ASC LIMIT 1").get() as {id:string}|undefined;
    if(!next)return;
    await generateFullBlogPost(next.id);
  }catch(e){console.error("SEO autopilot article generation failed",e);}finally{running=false;}
}

export function startBlogAutopilotLoop(){
  if(started||process.env.NODE_ENV==="test")return;
  started=true;
  setTimeout(()=>{void tick();},4_000).unref?.();
  setInterval(()=>{void tick();},15_000).unref?.();
}
