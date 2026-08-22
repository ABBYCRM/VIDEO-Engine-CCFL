import { db } from "@/lib/db";
import { generateFullBlogPost } from "@/lib/nvidia/blog-writer";

let started=false;
let running=false;

async function tick(){
  if(running)return;
  const next=db.prepare("SELECT id FROM blog_posts WHERE generation_status='pending' ORDER BY scheduled_at ASC, created_at ASC LIMIT 1").get() as {id:string}|undefined;
  if(!next)return;
  running=true;
  try{await generateFullBlogPost(next.id);}catch(e){console.error("SEO autopilot article generation failed",e);}finally{running=false;}
}

export function startBlogAutopilotLoop(){
  if(started||process.env.NODE_ENV==="test")return;
  started=true;
  setTimeout(()=>{void tick();},4_000).unref?.();
  setInterval(()=>{void tick();},15_000).unref?.();
}
